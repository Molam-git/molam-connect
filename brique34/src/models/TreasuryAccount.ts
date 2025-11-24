import { db } from '../config';

export class TreasuryAccount {
    id: string;
    bank_profile_id: string;
    account_reference: any;
    currency: string;
    account_type: string;
    ledger_account_code: string;
    status: string;
    created_at: Date;
    updated_at: Date;

    constructor(data: any) {
        this.id = data.id;
        this.bank_profile_id = data.bank_profile_id;
        this.account_reference = data.account_reference;
        this.currency = data.currency;
        this.account_type = data.account_type;
        this.ledger_account_code = data.ledger_account_code;
        this.status = data.status;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    static async findById(id: string): Promise<TreasuryAccount | null> {
        const result = await db.query('SELECT * FROM treasury_accounts WHERE id = $1', [id]);
        if (result.rows.length === 0) return null;
        return new TreasuryAccount(result.rows[0]);
    }

    static async create(data: Omit<TreasuryAccount, 'id' | 'created_at' | 'updated_at'>): Promise<TreasuryAccount> {
        const query = `
      INSERT INTO treasury_accounts (bank_profile_id, account_reference, currency, account_type, ledger_account_code, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
        const values = [
            data.bank_profile_id,
            data.account_reference,
            data.currency,
            data.account_type,
            data.ledger_account_code,
            data.status
        ];
        const result = await db.query(query, values);
        return new TreasuryAccount(result.rows[0]);
    }
}