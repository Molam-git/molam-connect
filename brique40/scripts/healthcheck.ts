// scripts/healthcheck.ts
import { pool } from '../src/db';
import { producer } from '../src/utils/kafka';

async function healthCheck() {
    try {
        // Check database connection
        await pool.query('SELECT 1');
        console.log('✅ Database connection OK');

        // Check Kafka connection
        await producer.connect();
        await producer.disconnect();
        console.log('✅ Kafka connection OK');

        console.log('🚀 All systems operational');
        process.exit(0);
    } catch (error) {
        console.error('❌ Health check failed:', error);
        process.exit(1);
    }
}

healthCheck();