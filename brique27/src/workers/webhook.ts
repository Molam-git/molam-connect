import { BaseWorker } from "./base-worker";

export class WebhookWorker extends BaseWorker {
    protected channel = 'webhook';
    protected provider = 'internal';

    protected async sendMessage(_job: any): Promise<{ id: string }> {
        // Envoyer à un webhook interne
        // Simuler l'envoi
        return { id: `webhook_${Date.now()}` };
    }
}

export function runWebhookWorker() {
    const worker = new WebhookWorker();
    return worker.run();
}