import { db } from '../config';

export class BankProfile {
    id: string;
    name: string;
    country: string;
    currency_codes: string[];
    rails: any;
    provider_type: string;
    compliance_level: string;
    legal_documents?: any;
    contact?: any;
    sla?: any;
    fees?: any;
    metadata?: any;
    created_at: Date;
    updated_at: Date;

    constructor(data: any) {
        this.id = data.id;
        this.name = data.name;
        this.country = data.country;
        this.currency_codes = data.currency_codes;
        this.rails = data.rails;
        this.provider_type = data.provider_type;
        this.compliance_level = data.compliance_level;
        this.legal_documents = data.legal_documents;
        this.contact = data.contact;
        this.sla = data.sla;
        this.fees = data.fees;
        this.metadata = data.metadata;
        this.created_at = data.created_at;
        this.updated_at = data.updated_at;
    }

    static async findById(id: string): Promise<BankProfile | null> {
        const result = await db.query('SELECT * FROM bank_profiles WHERE id = $1', [id]);
        if (result.rows.length === 0) return null;
        return new BankProfile(result.rows[0]);
    }

    static async create(data: Omit<BankProfile, 'id' | 'created_at' | 'updated_at'>): Promise<BankProfile> {
        const query = `
      INSERT INTO bank_profiles (name, country, currency_codes, rails, provider_type, compliance_level, legal_documents, contact, sla, fees, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
        const values = [
            data.name,
            data.country,
            data.currency_codes,
            data.rails,
            data.provider_type,
            data.compliance_level,
            data.legal_documents,
            data.contact,
            data.sla,
            data.fees,
            data.metadata
        ];
        const result = await db.query(query, values);
        return new BankProfile(result.rows[0]);
    }

    // Ajouter d'autres méthodes selon les besoins (update, delete, etc.)
}