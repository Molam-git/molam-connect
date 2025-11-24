const VoiceWorker = require('../../services/aggregator/voice_worker');
const { pool } = require('../../services/db');

describe('Voice Worker Integration', () => {
    let voiceWorker;

    beforeAll(async () => {
        voiceWorker = new VoiceWorker();
    });

    beforeEach(async () => {
        await pool.query('DELETE FROM voice_templates');
        await pool.query('DELETE FROM alert_delivery_logs WHERE target = $1', ['+221701234567']);
    });

    test('should enqueue voice call and process template', async () => {
        // Insert test template
        await pool.query(`
      INSERT INTO voice_templates (id, language, country, tts_text)
      VALUES ('test_alert', 'fr', 'SN', 'Alerte de sécurité Molam Pay')
    `);

        const job = {
            phone: '+221701234567',
            templateId: 'test_alert',
            lang: 'fr',
            metadata: { alert_id: 'test-uuid', rule_id: 1 }
        };

        const result = await voiceWorker.enqueueCall(job);

        expect(result.status).toBe('queued');

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify delivery log was created
        const logs = await pool.query(
            'SELECT * FROM alert_delivery_logs WHERE target = $1',
            ['+221701234567']
        );

        expect(logs.rows.length).toBe(1);
        expect(logs.rows[0].channel).toBe('voice');
    });

    test('should handle template not found error', async () => {
        const job = {
            phone: '+221701234567',
            templateId: 'non_existent',
            metadata: { alert_id: 'test-uuid', rule_id: 1 }
        };

        await expect(voiceWorker.enqueueCall(job)).rejects.toThrow();
    });
});