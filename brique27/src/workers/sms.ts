import { dequeueDueOutbox, markSent, markFailed, recordDelivery } from "../store/outbox";

// Simuler Twilio - remplacer par le vrai client en production
const twilioSend = async (_to: string, _body: string) => {
    // Implémentation réelle avec Twilio
    return { id: `sms_${Date.now()}` };
};

function backoffNext(attemptCount: number): Date {
    const minutes = Math.pow(2, attemptCount);
    const next = new Date();
    next.setMinutes(next.getMinutes() + minutes);
    return next;
}

export async function runSmsWorker() {
    console.log('SMS worker started');

    while (true) {
        try {
            const jobs = await dequeueDueOutbox("sms", 100);

            for (const job of jobs) {
                try {
                    const phone = job.payload.ctx?.phone || job.payload.phone;
                    if (!phone) {
                        throw new Error('No phone number available');
                    }

                    const resp = await twilioSend(phone, job.rendered_body);
                    await recordDelivery(job.id, "twilio", resp.id, "sent");
                    await markSent(job.id);

                    console.log(`SMS sent to ${phone}: ${job.id}`);
                } catch (error: any) {
                    console.error(`SMS failed for job ${job.id}:`, error.message);
                    await recordDelivery(job.id, "twilio", undefined, "failed", error.message);
                    await markFailed(job.id, backoffNext(job.attempt_count));
                }
            }

            if (jobs.length === 0) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Attendre 5s si vide
            }
        } catch (error) {
            console.error('SMS worker error:', error);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}