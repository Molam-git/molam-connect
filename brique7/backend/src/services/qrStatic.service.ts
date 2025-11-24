// src/services/qrStatic.service.ts
import crypto from 'crypto';
import { pool } from '../db/index';

const HMAC_KEY = process.env.STATIC_QR_HMAC_KEY!;

export type ParsedStaticQR = {
    type: "merchant" | "agent";
    merchantId?: string;
    terminalId?: string;
    agentId?: string;
    countryCode: string;
    currency: string;
    version: number;
    raw: string;
};

export function signStaticQR(payloadNoSig: string): string {
    const sig = crypto.createHmac('sha256', HMAC_KEY).update(payloadNoSig).digest('hex');
    return `${payloadNoSig}|sig=${sig}`;
}

export function parseAndVerify(qrValue: string): ParsedStaticQR {
    if (!qrValue.startsWith('molam:stq:')) throw new Error('Invalid schema');

    const parts = qrValue.replace('molam:stq:', '').split('|');
    const map: Record<string, string> = {};

    parts.forEach(p => {
        const [k, v] = p.split('=');
        map[k] = v;
    });

    const { v, t, mid, tid, aid, cc, cur, sig } = map;

    const withoutSig = parts.filter(p => !p.startsWith('sig=')).join('|');
    const expected = crypto.createHmac('sha256', HMAC_KEY).update(withoutSig).digest('hex');

    if (expected !== sig) throw new Error('Invalid signature');
    if (t === 'M' && (!mid || !tid)) throw new Error('Missing merchant fields');
    if (t === 'A' && (!aid)) throw new Error('Missing agent field');

    return {
        type: t === 'M' ? 'merchant' : 'agent',
        merchantId: mid,
        terminalId: tid,
        agentId: aid,
        countryCode: cc,
        currency: cur,
        version: Number(v),
        raw: qrValue
    };
}

export class QRStaticService {
    deactivateQR(qr_id: any) {
        throw new Error('Method not implemented.');
    }
    rotateQR(qr_id: any) {
        throw new Error('Method not implemented.');
    }
    async assignQR(data: any): Promise<any> {
        const { type, merchant_id, terminal_id, agent_id, country_code, currency } = data;

        let payloadNoSig = `molam:stq:v=1|t=${type === 'merchant' ? 'M' : 'A'}`;

        if (type === 'merchant') {
            payloadNoSig += `|mid=${merchant_id}|tid=${terminal_id}`;
        } else {
            payloadNoSig += `|aid=${agent_id}`;
        }

        payloadNoSig += `|cc=${country_code}|cur=${currency}`;

        const qr_value = signStaticQR(payloadNoSig);

        const result = await pool.query(
            `INSERT INTO molam_qr_static 
       (merchant_id, terminal_id, agent_id, qr_payload, version) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id`,
            [merchant_id, terminal_id, agent_id, qr_value, 1]
        );

        return {
            qr_id: result.rows[0].id,
            qr_value,
            version: 1
        };
    }

    async parseQR(parsed: ParsedStaticQR): Promise<any> {
        const qrData = await this.findQRByPayload(parsed.raw);

        if (!qrData || !qrData.is_active) {
            throw new Error('QR not found or inactive');
        }

        let merchant, terminal, agent;

        if (parsed.type === 'merchant') {
            merchant = await this.getMerchantById(parsed.merchantId!);
            terminal = await this.getTerminalById(parsed.terminalId!);
        } else {
            agent = await this.getAgentById(parsed.agentId!);
        }

        const presets = await this.getQRPresets(qrData.id);

        return {
            type: parsed.type,
            merchant: merchant ? {
                id: merchant.id,
                display_name: merchant.display_name
            } : undefined,
            terminal: terminal ? {
                id: terminal.id,
                label: terminal.label
            } : undefined,
            agent: agent ? {
                id: agent.id,
                display_name: 'Agent'
            } : undefined,
            country_code: parsed.countryCode,
            currency: parsed.currency,
            presets: presets.map(p => ({ amount: p.amount, label: p.label }))
        };
    }

    async createPayment(data: any, userId: string): Promise<any> {
        const { qr_value, amount, currency } = data;

        const parsed = parseAndVerify(qr_value);
        const qrData = await this.findQRByPayload(qr_value);

        if (!qrData || !qrData.is_active) {
            throw new Error('QR not found or inactive');
        }

        const fees = this.calculateFees(amount, currency, parsed.type);

        const result = await pool.query(
            `INSERT INTO molam_qr_payments 
       (qr_id, payer_user_id, payee_type, payee_id, terminal_id, amount, currency, fee_total, fee_breakdown) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING id`,
            [
                qrData.id,
                userId,
                parsed.type,
                parsed.type === 'merchant' ? parsed.merchantId! : parsed.agentId!,
                parsed.terminalId,
                amount,
                currency,
                fees.total,
                fees.breakdown
            ]
        );

        return {
            payment_id: result.rows[0].id,
            status: 'pending',
            preview: {
                amount: `${amount} ${currency}`,
                fees: {
                    molam: `${fees.breakdown.molam} ${currency}`,
                    partner: `${fees.breakdown.partner} ${currency}`,
                    agent_share: `${fees.breakdown.agent_share} ${currency}`
                },
                total: `${amount + fees.total} ${currency}`
            }
        };
    }

    async confirmPayment(payment_id: string, pin: string): Promise<any> {
        // Vérifier le statut du paiement
        const payment = await pool.query(
            'SELECT * FROM molam_qr_payments WHERE id = $1',
            [payment_id]
        );

        if (!payment.rows[0]) {
            throw new Error('Payment not found');
        }

        if (payment.rows[0].status !== 'pending') {
            throw new Error('Payment already processed');
        }

        // Vérifier le PIN (simplifié)
        const pinValid = await this.verifyPIN(payment.rows[0].payer_user_id, pin);
        if (!pinValid) {
            throw new Error('Invalid PIN');
        }

        // Mettre à jour le statut
        await pool.query(
            `UPDATE molam_qr_payments 
       SET status = 'confirmed', confirmed_at = NOW() 
       WHERE id = $1`,
            [payment_id]
        );

        return {
            status: 'success',
            transaction_id: `TRX-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${payment_id.slice(-5)}`,
            message: 'Paiement confirmé'
        };
    }

    async cancelPayment(payment_id: string): Promise<void> {
        await pool.query(
            `UPDATE molam_qr_payments 
       SET status = 'cancelled', cancelled_at = NOW() 
       WHERE id = $1 AND status = 'pending'`,
            [payment_id]
        );
    }

    private async findQRByPayload(qr_payload: string): Promise<any> {
        const result = await pool.query(
            `SELECT * FROM molam_qr_static 
       WHERE qr_payload = $1 AND is_active = true`,
            [qr_payload]
        );

        return result.rows[0] || null;
    }

    private async getMerchantById(id: string): Promise<any> {
        const result = await pool.query(
            `SELECT id, legal_name, display_name 
       FROM molam_merchants 
       WHERE id = $1 AND status = 'active'`,
            [id]
        );

        return result.rows[0];
    }

    private async getTerminalById(id: string): Promise<any> {
        const result = await pool.query(
            `SELECT id, label 
       FROM molam_terminals 
       WHERE id = $1 AND is_active = true`,
            [id]
        );

        return result.rows[0];
    }

    private async getAgentById(id: string): Promise<any> {
        const result = await pool.query(
            `SELECT id 
       FROM molam_agents 
       WHERE id = $1 AND status = 'active'`,
            [id]
        );

        return result.rows[0];
    }

    private async getQRPresets(qr_id: string): Promise<any[]> {
        const result = await pool.query(
            `SELECT amount, currency, label 
       FROM molam_qr_presets 
       WHERE qr_id = $1 
       ORDER BY position ASC`,
            [qr_id]
        );

        return result.rows;
    }

    private calculateFees(amount: number, currency: string, type: string): any {
        // Logique simplifiée - à adapter selon la grille locale
        const molamFee = Math.round(amount * 0.01); // 1%
        const partnerFee = 0;
        const agentShare = type === 'agent' ? Math.round(amount * 0.002) : 0; // 0.2% pour agent

        return {
            total: molamFee + partnerFee,
            breakdown: {
                molam: molamFee,
                partner: partnerFee,
                agent_share: agentShare
            }
        };
    }

    private async verifyPIN(userId: string, pin: string): Promise<boolean> {
        // Implémentation simplifiée - à remplacer par la vraie vérification
        return pin === '1234'; // Pour les tests
    }
}