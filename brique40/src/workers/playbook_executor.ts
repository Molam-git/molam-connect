// src/workers/playbook_executor.ts
import { consumer, kafkaInit, publish } from "../utils/kafka";
import { pool } from "../db";
import { executeStep } from "../utils/executeStep";

async function start() {
    await kafkaInit();
    await consumer.subscribe({ topic: "fraud.playbook.execute", fromBeginning: false });

    await consumer.run({
        eachMessage: async ({ message }) => {
            try {
                const payload = JSON.parse(message.value!.toString());
                const { caseId, playbook, idempotency } = payload;
                const caseRow = (await pool.query(`SELECT * FROM fraud_cases WHERE id=$1`, [caseId])).rows[0];
                if (!caseRow) {
                    await pool.query(`INSERT INTO fraud_automation_logs (source, event) VALUES ($1,$2)`, ["worker", { error: "case_not_found", caseId }]);
                    return;
                }

                for (const step of playbook.dsl.steps) {
                    if (step.condition) {
                        if (step.condition.score_lt && !(Number(caseRow.score) < Number(step.condition.score_lt))) {
                            continue;
                        }
                    }

                    try {
                        const ctx = { fraudCase: caseRow, idempotency };
                        const result = await executeStep(step, ctx);
                        await pool.query(
                            `INSERT INTO fraud_case_actions (fraud_case_id, actor_id, action_type, payload, idempotency_key) VALUES ($1,$2,$3,$4,$5)`,
                            [caseId, null, `auto_step:${step.type}`, JSON.stringify({ step: step.name, result }), idempotency]
                        );

                        if (step.wait_for_approval) {
                            await pool.query(`INSERT INTO fraud_automation_logs (source, event) VALUES ($1,$2)`, ["worker", { event: "wait_for_approval", caseId, step }]);
                            break;
                        }
                    } catch (stepErr: any) {
                        await pool.query(`INSERT INTO fraud_automation_logs (source, event) VALUES ($1,$2)`, ["worker", { error: stepErr.message, caseId, step }]);
                        if (step.on_failure && step.on_failure.action === "alert_ops") {
                            await publish("ops.alerts", { caseId, err: stepErr.message, severity: step.on_failure.severity || "critical" });
                        }
                        break;
                    }
                }
            } catch (err: any) {
                console.error("playbook executor error", err);
            }
        }
    });
}

start().catch(err => { console.error(err); process.exit(1); });