import { BaseWorker } from "./base-worker";

export class PushWorker extends BaseWorker {
    protected channel = 'push';
    protected provider = 'fcm';

    protected async sendMessage(job: any): Promise<{ id: string }> {
        // Implémentation réelle avec FCM (Firebase Cloud Messaging)
        // Pour l'instant, on simule
        const pushToken = job.payload.ctx?.pushToken;
        if (!pushToken) {
            throw new Error('No push token available');
        }

        // Simuler l'envoi
        return { id: `fcm_${Date.now()}` };
    }
}

export function runPushWorker() {
    const worker = new PushWorker();
    return worker.run();
}