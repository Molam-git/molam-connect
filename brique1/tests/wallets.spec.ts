import request from "supertest";
import { pool } from "../src/db/pg";
import "../src/server";

const auth = Buffer.from(JSON.stringify({
    userId: "11111111-1111-1111-1111-111111111111",
    userType: "external",
    roles: ["user"],
})).toString("base64");

describe("Wallets API", () => {
    it("should create idempotent wallet per (user,currency)", async () => {
        const body = {
            user_id: "11111111-1111-1111-1111-111111111111",
            country_code: "SN",
            currency: "XOF",
            is_default: true,
        };
        const r1 = await request("http://localhost:8080")
            .post("/api/pay/wallets")
            .set("Authorization", `Bearer ${auth}`)
            .send(body);
        expect([200, 201]).toContain(r1.status);

        const r2 = await request("http://localhost:8080")
            .post("/api/pay/wallets")
            .set("Authorization", `Bearer ${auth}`)
            .send(body);
        expect([200, 201]).toContain(r2.status);
        expect(r2.body.currency).toBe("XOF");
    });

    it("should enforce single default per currency", async () => {
        const u = "11111111-1111-1111-1111-111111111111";
        const r3 = await request("http://localhost:8080")
            .post("/api/pay/wallets")
            .set("Authorization", `Bearer ${auth}`)
            .send({ user_id: u, country_code: "SN", currency: "XOF", is_default: true });

        const r4 = await request("http://localhost:8080")
            .post("/api/pay/wallets")
            .set("Authorization", `Bearer ${auth}`)
            .send({ user_id: u, country_code: "CI", currency: "XOF", is_default: true });

        expect([200, 201]).toContain(r3.status);
        expect([200, 201]).toContain(r4.status);

        const list = await request("http://localhost:8080")
            .get("/api/pay/wallets")
            .set("Authorization", `Bearer ${auth}`);
        const defaults = list.body.items.filter((w: any) => w.currency === "XOF" && w.is_default);
        expect(defaults.length).toBe(1);
    });

    afterAll(async () => {
        await pool.end();
    });
});