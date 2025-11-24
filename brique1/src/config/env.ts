import * as dotenv from "dotenv";
dotenv.config();

export const config = {
    pg: {
        connectionString: process.env.DATABASE_URL!,
        ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined
    },
    serviceName: "molam-pay-wallets",
};