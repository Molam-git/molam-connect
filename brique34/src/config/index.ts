import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

export const db = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

export const ledger = {
    createHold: async (data: any) => {
        console.log('Creating ledger hold:', data);
        return Promise.resolve();
    },
    finalizeHold: async (data: any) => {
        console.log('Finalizing ledger hold:', data);
        return Promise.resolve();
    }
};

// Autres configurations (Vault, HSM, etc.) peuvent être ajoutées ici