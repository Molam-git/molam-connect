import { dequeueDueOutbox, markSent, markFailed, recordDelivery } from "../store/outbox";

export abstract class BaseWorker {
    protected abstract channel: string;
    protected abstract provider: string;

    protected abstract sendMessage(job: any): Promise<{ id: string }>;

    public async run() {
        console.log(`${this.channel} worker started`);

        while (true) {
            try {
                const jobs = await dequeueDueOutbox(this.channel, 100);

                for (const job of jobs) {
                    await this.processJob(job);
                }

                if (jobs.length === 0) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            } catch (error) {
                console.error(`${this.channel} worker error:`, error);
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }

    private async processJob(job: any) {
        try {
            const resp = await this.sendMessage(job);
            await recordDelivery(job.id, this.provider, resp.id, "sent");
            await markSent(job.id);

            console.log(`${this.channel} sent: ${job.id}`);
        } catch (error: any) {
            console.error(`${this.channel} failed for job ${job.id}:`, error.message);
            await recordDelivery(job.id, this.provider, undefined, "failed", error.message);
            await markFailed(job.id, this.backoffNext(job.attempt_count));
        }
    }

    private backoffNext(attemptCount: number): Date {
        const minutes = Math.pow(2, attemptCount);
        const next = new Date();
        next.setMinutes(next.getMinutes() + minutes);
        return next;
    }
}