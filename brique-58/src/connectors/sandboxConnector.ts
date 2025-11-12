import {
  NetworkConnector,
  NetworkDisputeSubmission,
  NetworkSubmissionResponse,
} from './networkConnector';
import { v4 as uuidv4 } from 'uuid';

/**
 * Sandbox Network Connector
 * Mock connector for testing without real network API calls
 */
export class SandboxConnector implements NetworkConnector {
  readonly network = 'sandbox';

  private submissions: Map<
    string,
    {
      submission: NetworkDisputeSubmission;
      status: string;
      outcome?: string;
      submitted_at: string;
    }
  > = new Map();

  async submitDispute(submission: NetworkDisputeSubmission): Promise<NetworkSubmissionResponse> {
    // Simulate network processing delay
    await this.delay(500);

    // Generate mock provider ref
    const providerRef = `SANDBOX-${uuidv4().substring(0, 8).toUpperCase()}`;

    // Store submission
    this.submissions.set(providerRef, {
      submission,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    });

    console.log(`[SandboxConnector] Submitted dispute ${submission.dispute_id} -> ${providerRef}`);

    // Simulate random outcomes for testing
    const random = Math.random();
    const status = random > 0.9 ? 'rejected' : 'accepted';

    return {
      success: status === 'accepted',
      provider_ref: providerRef,
      status,
      message: status === 'accepted' ? 'Dispute submitted successfully' : 'Dispute rejected - insufficient evidence',
      estimated_resolution_date: this.getEstimatedResolutionDate(),
      raw_response: {
        network: 'sandbox',
        submission_id: providerRef,
        timestamp: new Date().toISOString(),
      },
    };
  }

  async checkStatus(providerRef: string): Promise<{
    status: string;
    last_updated: string;
    outcome?: string;
    raw_response?: any;
  }> {
    await this.delay(200);

    const submission = this.submissions.get(providerRef);

    if (!submission) {
      throw new Error(`Submission not found: ${providerRef}`);
    }

    // Simulate status progression
    const random = Math.random();
    let status = submission.status;
    let outcome: string | undefined;

    if (status === 'submitted') {
      status = 'under_review';
      submission.status = status;
    } else if (status === 'under_review') {
      // 50% chance of resolution
      if (random > 0.5) {
        status = 'resolved';
        outcome = random > 0.7 ? 'won' : 'lost';
        submission.status = status;
        submission.outcome = outcome;
      }
    }

    console.log(`[SandboxConnector] Status check ${providerRef}: ${status}${outcome ? ` (${outcome})` : ''}`);

    return {
      status,
      last_updated: new Date().toISOString(),
      outcome,
      raw_response: {
        provider_ref: providerRef,
        status,
        outcome,
      },
    };
  }

  async withdrawDispute(providerRef: string, reason?: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    await this.delay(300);

    const submission = this.submissions.get(providerRef);

    if (!submission) {
      return {
        success: false,
        message: 'Submission not found',
      };
    }

    submission.status = 'withdrawn';
    submission.outcome = 'withdrawn';

    console.log(`[SandboxConnector] Withdrew dispute ${providerRef}: ${reason || 'no reason provided'}`);

    return {
      success: true,
      message: 'Dispute withdrawn successfully',
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getEstimatedResolutionDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 30); // +30 days
    return date.toISOString().split('T')[0];
  }
}

// Auto-register sandbox connector
import { NetworkConnectorRegistry } from './networkConnector';
NetworkConnectorRegistry.register('sandbox', new SandboxConnector());
