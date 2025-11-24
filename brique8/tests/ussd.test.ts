import request from "supertest";
import app from "../src/ussd/server";
import { pool } from "../src/config/database";

describe("USSD Integration with Real Database", () => {
    beforeAll(async () => {
        // Nettoyer les données de test avant de commencer
        await pool.query('DELETE FROM ussd_audit_logs WHERE session_id LIKE $1', ['test-session-%']);
        await pool.query('DELETE FROM ussd_msisdn_registry WHERE msisdn LIKE $1', ['+22177test%']);
    });

    afterAll(async () => {
        await pool.end();
    });

    test("should create new user profile on first USSD access", async () => {
        const testMsisdn = '+221771234500';

        const res = await request(app)
            .post("/api/ussd/receive")
            .send({
                sessionId: "test-session-new-user",
                msisdn: testMsisdn,
                text: "",
                operator: "orange",
                serviceCode: "*131#"
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("CON");
        expect(res.text).toContain("Molam");

        // Vérifier que le profil a été créé en base
        const profileResult = await pool.query(
            'SELECT * FROM ussd_msisdn_registry WHERE msisdn = $1',
            [testMsisdn]
        );

        expect(profileResult.rows.length).toBe(1);
        expect(profileResult.rows[0].country_code).toBe('SN');
        expect(profileResult.rows[0].currency).toBe('XOF');
    });

    test("should handle balance check flow", async () => {
        const res = await request(app)
            .post("/api/ussd/receive")
            .send({
                sessionId: "test-session-balance",
                msisdn: "+221770000000",
                text: "1",
                operator: "orange",
                serviceCode: "*131#"
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("PIN");

        // Vérifier l'audit log
        const auditResult = await pool.query(
            'SELECT * FROM ussd_audit_logs WHERE session_id = $1 AND step = $2',
            ['test-session-balance', 'pin_check']
        );

        expect(auditResult.rows.length).toBeGreaterThan(0);
    });

    test("should handle P2P destination input", async () => {
        const res = await request(app)
            .post("/api/ussd/receive")
            .send({
                sessionId: "test-session-p2p",
                msisdn: "+221770000000",
                text: "3",
                operator: "orange",
                serviceCode: "*131#"
            });

        expect(res.status).toBe(200);
        expect(res.text).toContain("destinataire");
    });

    test("should audit all USSD interactions", async () => {
        const sessionId = "test-session-audit";

        await request(app)
            .post("/api/ussd/receive")
            .send({
                sessionId: sessionId,
                msisdn: "+221770000000",
                text: "2",
                operator: "orange",
                serviceCode: "*131#"
            });

        // Vérifier les logs d'audit
        const auditResult = await pool.query(
            'SELECT * FROM ussd_audit_logs WHERE session_id = $1',
            [sessionId]
        );

        expect(auditResult.rows.length).toBeGreaterThan(0);
        expect(auditResult.rows[0].msisdn).toBe('+221770000000');
        expect(auditResult.rows[0].country_code).toBe('SN');
    });
});