/**
 * Brique 50 - Fiscal Reporting
 * Submission Service
 */

import { pool } from "../utils/db.js";
import { apiConnector } from "../utils/authorities/apiConnector.js";
import { sftpConnector } from "../utils/authorities/sftpConnector.js";
import { portalConnector } from "../utils/authorities/portalConnector.js";
import { signWithHSM } from "../utils/hsm.js";
import { publishEvent } from "../webhooks/publisher.js";
import { auditLog } from "../utils/audit.js";
import { downloadFromS3, putS3WORM } from "../utils/s3.js";

export interface SubmitReportParams {
  reportId: string;
  channelId: string;
  idempotencyKey?: string;
  requestedBy?: string;
}

/**
 * Submit a fiscal report to an authority channel
 */
export async function submitReport(params: SubmitReportParams): Promise<any> {
  const { reportId, channelId, idempotencyKey, requestedBy } = params;

  // 1) Fetch report
  const { rows: reportRows } = await pool.query(`SELECT * FROM fiscal_reports WHERE id = $1`, [reportId]);

  if (reportRows.length === 0) {
    throw new Error("report_not_found");
  }

  const report = reportRows[0];

  // 2) Fetch channel
  const { rows: channelRows } = await pool.query(
    `SELECT * FROM fiscal_submission_channels WHERE id = $1`,
    [channelId]
  );

  if (channelRows.length === 0) {
    throw new Error("channel_not_found");
  }

  const channel = channelRows[0];

  // 3) Check if channel is active
  if (channel.status !== "active") {
    throw new Error("channel_not_active");
  }

  // 4) Approval check
  if (channel.approval_required) {
    const { rows: approvals } = await pool.query(
      `SELECT * FROM fiscal_approvals
       WHERE report_id = $1 AND status = 'approved'`,
      [reportId]
    );

    if (approvals.length === 0) {
      throw new Error("approval_required");
    }
  }

  // 5) Sign artifact if required
  let artifactKey = report.artifact_s3_key;
  let signedArtifactKey = artifactKey;

  if (channel.requires_signature) {
    console.log(`[Submission] Signing artifact with HSM: ${artifactKey}`);

    const artifactData = await downloadFromS3(artifactKey);
    const signature = await signWithHSM(artifactKey, artifactData);

    // Store signed artifact (in production, embed signature in document)
    signedArtifactKey = `${artifactKey}.signed`;
    await putS3WORM(signedArtifactKey, Buffer.from(`${artifactData.toString()}\n\nSignature: ${signature}`));

    await pool.query(`UPDATE fiscal_reports SET signed_artifact_s3_key = $1 WHERE id = $2`, [
      signedArtifactKey,
      reportId,
    ]);
  }

  // 6) Check for existing submission (idempotency)
  const submissionIdempotencyKey = idempotencyKey || `auto-${reportId}-${channelId}`;

  const { rows: existingSubmissions } = await pool.query(
    `SELECT * FROM fiscal_submissions WHERE report_id = $1 AND idempotency_key = $2`,
    [reportId, submissionIdempotencyKey]
  );

  if (existingSubmissions.length > 0) {
    console.log(`[Submission] Found existing submission: ${existingSubmissions[0].id}`);
    return existingSubmissions[0];
  }

  // 7) Create submission record
  const { rows: submissionRows } = await pool.query(
    `INSERT INTO fiscal_submissions(
      report_id, channel_id, idempotency_key, status, attempt_count, submitted_by
    ) VALUES ($1, $2, $3, 'pending', 0, $4)
    RETURNING *`,
    [reportId, channelId, submissionIdempotencyKey, requestedBy]
  );

  const submission = submissionRows[0];

  // 8) Dispatch to channel connector
  let resp;

  try {
    if (channel.protocol === "api") {
      resp = await apiConnector.send(channel, signedArtifactKey);
    } else if (channel.protocol === "sftp") {
      resp = await sftpConnector.send(channel, signedArtifactKey);
    } else if (channel.protocol === "portal") {
      resp = await portalConnector.send(channel, signedArtifactKey);
    } else {
      throw new Error(`Unsupported protocol: ${channel.protocol}`);
    }

    // 9) Update submission with response
    await pool.query(
      `UPDATE fiscal_submissions
       SET status = $1, external_ref = $2, response = $3,
           attempt_count = attempt_count + 1, last_attempt = now(), updated_at = now()
       WHERE id = $4`,
      [resp.status, resp.ref, resp.raw, submission.id]
    );

    // 10) Update report status if accepted
    if (resp.status === "accepted") {
      await pool.query(`UPDATE fiscal_reports SET status = 'accepted' WHERE id = $1`, [reportId]);
    } else if (resp.status === "submitted") {
      await pool.query(`UPDATE fiscal_reports SET status = 'submitted' WHERE id = $1`, [reportId]);
    } else if (resp.status === "error") {
      // Create remediation task
      await pool.query(
        `INSERT INTO fiscal_remediations(report_id, submission_id, issue_code, severity, details, status)
         VALUES ($1, $2, $3, $4, $5, 'open')`,
        [reportId, submission.id, "submission_error", "high", resp.raw, "open"]
      );
    }

    // 11) Audit log
    await auditLog({
      action: "report_submitted",
      actor_id: requestedBy,
      actor_type: "user",
      resource_type: "fiscal_submission",
      resource_id: submission.id,
      details: {
        report_id: reportId,
        channel_id: channelId,
        status: resp.status,
        external_ref: resp.ref,
      },
    });

    // 12) Publish event
    await publishEvent("internal", "treasury", `fiscal.submission.${resp.status}`, {
      submission_id: submission.id,
      report_id: reportId,
      channel: channel.authority,
      status: resp.status,
    });

    return { ...submission, ...resp };
  } catch (err: any) {
    console.error("[Submission] Error:", err);

    // Update submission with error
    await pool.query(
      `UPDATE fiscal_submissions
       SET status = 'error', error_code = 'submission_failed',
           error_message = $1, attempt_count = attempt_count + 1,
           last_attempt = now(), updated_at = now()
       WHERE id = $2`,
      [err.message, submission.id]
    );

    // Create remediation task
    await pool.query(
      `INSERT INTO fiscal_remediations(report_id, submission_id, issue_code, severity, details, status)
       VALUES ($1, $2, $3, $4, $5, 'open')`,
      [reportId, submission.id, "submission_error", "high", { error: err.message }, "open"]
    );

    throw err;
  }
}

/**
 * Get submission history for a report
 */
export async function getSubmissionHistory(reportId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT s.*, c.authority, c.protocol
     FROM fiscal_submissions s
     JOIN fiscal_submission_channels c ON c.id = s.channel_id
     WHERE s.report_id = $1
     ORDER BY s.created_at DESC`,
    [reportId]
  );

  return rows;
}
