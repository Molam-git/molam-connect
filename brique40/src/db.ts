// src/db.ts
import { Pool } from "pg";

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_MAX_CLIENTS || 20),
});