import { BaseWorker } from "./base-worker";

export class EmailWorker extends BaseWorker {
    protected channel = 'email';
    protected provider = 'mailgun';

    protected async sendMessage(job: any): Promise<{ id: string }> {
        const email = job.payload.ctx?.email;
        if (!email) {
            throw new Error('No email available');
        }

        // Simuler l'envoi avec Mailgun
        return { id: `mailgun_${Date.now()}` };
    }
}

export function runEmailWorker() {
    const worker = new EmailWorker();
    return worker.run();
}