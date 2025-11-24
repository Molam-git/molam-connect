import { pool } from "../db";

type VoiceJob = {
    phone: string;
    templateId: string;
    lang?: string;
    attempt?: number;
    metadata?: any;
};

export default class VoiceWorker {
    queue: VoiceJob[] = [];
    running = false;

    constructor() {
        /* maybe init Twilio client here based on env */
    }

    async enqueueCall(job: VoiceJob): Promise<{ status: string }> {
        // Retourner seulement status sans detail
        this.queue.push(job);
        this.processQueue().catch(console.error);
        return { status: "queued" };
    }

    async processQueue() {
        if (this.running) return;
        this.running = true;

        while (this.queue.length) {
            const job = this.queue.shift()!;
            try {
                const template = await this.fetchTemplate(job.templateId);

                // 1) send SMS via SMS gateway
                if (process.env.SMS_GATEWAY_URL) {
                    await fetch(process.env.SMS_GATEWAY_URL, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ to: job.phone, message: template.tts_text })
                    });
                }

                // 2) Initiate voice TTS call (Twilio or SIP gateway)
                if (process.env.TWILIO_ACCOUNT_SID) {
                    // pseudo-code: use Twilio SDK here
                    console.log(`Voice call to ${job.phone}: ${template.tts_text}`);
                } else if (process.env.VOICE_GATEWAY_URL) {
                    await fetch(process.env.VOICE_GATEWAY_URL, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ phone: job.phone, tts: template.tts_text, lang: job.lang })
                    });
                }

                await pool.query(
                    `INSERT INTO alert_delivery_logs(id, alert_id, rule_id, channel, target, status, detail, attempt, created_at)
           VALUES (gen_random_uuid(), $1,$2,'voice',$3,'sent',$4, $5, now())`,
                    [job.metadata?.alert_id || null, job.metadata?.rule_id || null, job.phone, { templateId: job.templateId }, job.attempt || 1]
                );
            } catch (err: any) {
                console.error("voice job failed", err);
                await pool.query(
                    `INSERT INTO alert_delivery_logs(id, alert_id, rule_id, channel, target, status, detail, attempt, created_at)
           VALUES (gen_random_uuid(), $1,$2,'voice',$3,'failed',$4, $5, now())`,
                    [job.metadata?.alert_id || null, job.metadata?.rule_id || null, job.phone, { error: err.message }, job.attempt || 1]
                );

                // simple retry logic
                if ((job.attempt || 1) < 3) {
                    job.attempt = (job.attempt || 1) + 1;
                    this.queue.push(job);
                } else {
                    // escalate for critical alerts
                    console.log(`Voice call failed after 3 attempts for alert: ${job.metadata?.alert_id}`);
                }
            }
        }
        this.running = false;
    }

    async fetchTemplate(id: string) {
        const { rows } = await pool.query("SELECT * FROM voice_templates WHERE id = $1", [id]);
        if (!rows.length) throw new Error("template_not_found");
        return rows[0];
    }
}