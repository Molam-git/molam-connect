import { Pool } from "pg";

const db = new Pool({
    connectionString: process.env.DATABASE_URL
});

interface NormalizedInput {
    sessionId: string;
    msisdn: string;
    operator: string;
    countryCode: string;
}

export async function audit(
    norm: NormalizedInput,
    step: string,
    payload: any,
    result: "ok" | "denied" | "error"
): Promise<void> {
    try {
        await db.query(
            `INSERT INTO ussd_audit_logs(session_id, msisdn, country_code, operator, step, payload, result)
       VALUES($1, $2, $3, $4, $5, $6, $7)`,
            [norm.sessionId, norm.msisdn, norm.countryCode, norm.operator, step, payload, result]
        );
    } catch (error) {
        console.error("Audit log error:", error);
    }
}