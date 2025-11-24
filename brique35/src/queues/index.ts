import { Queue } from 'bullmq';

const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379')
};

export const payoutQueue = new Queue('payouts', { connection });

export async function initQueues() {
    console.log('Initializing queues...');

    // Nettoyer les anciens jobs si nécessaire
    // await payoutQueue.obrigerate({ force: true });

    console.log('✅ Queues initialized');
}