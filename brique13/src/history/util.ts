import { FilterInput, KeysetPagination } from './types';

export function buildFilters(input: FilterInput) {
    const clauses: string[] = [];
    const params: any[] = [];
    let paramCount = 0;

    // Filtrage par scope
    if (input.scope === 'user' && input.userId) {
        paramCount++;
        clauses.push(`AND user_id = $${paramCount}`);
        params.push(input.userId);
    } else if (input.scope === 'merchant' && input.merchantId) {
        paramCount++;
        clauses.push(`AND merchant_id = $${paramCount}`);
        params.push(input.merchantId);
    }

    // Filtres de date
    if (input.from) {
        paramCount++;
        clauses.push(`AND created_at >= $${paramCount}`);
        params.push(input.from);
    }

    if (input.to) {
        paramCount++;
        clauses.push(`AND created_at <= $${paramCount}`);
        params.push(input.to);
    }

    // Filtres de type et statut
    if (input.type) {
        paramCount++;
        clauses.push(`AND tx_type = $${paramCount}`);
        params.push(input.type);
    }

    if (input.status) {
        paramCount++;
        clauses.push(`AND status = $${paramCount}`);
        params.push(input.status);
    }

    // Filtres de montant
    if (input.min) {
        paramCount++;
        clauses.push(`AND amount >= $${paramCount}`);
        params.push(input.min);
    }

    if (input.max) {
        paramCount++;
        clauses.push(`AND amount <= $${paramCount}`);
        params.push(input.max);
    }

    // Filtres géographiques et devise
    if (input.currency) {
        paramCount++;
        clauses.push(`AND currency = $${paramCount}`);
        params.push(input.currency);
    }

    if (input.country) {
        paramCount++;
        clauses.push(`AND country_code = $${paramCount}`);
        params.push(input.country);
    }

    // Filtre de canal
    if (input.channel) {
        paramCount++;
        clauses.push(`AND channel = $${paramCount}`);
        params.push(input.channel);
    }

    // Recherche textuelle
    if (input.q) {
        paramCount++;
        clauses.push(`AND (reference ILIKE $${paramCount} OR id::text = $${paramCount})`);
        params.push(`%${input.q}%`);
    }

    return {
        whereSQL: clauses.join(' '),
        params
    };
}

export function buildKeysetPage(query: any): KeysetPagination {
    const beforeTs = query.before_ts as string | undefined;
    const beforeId = query.before_id as string | undefined;
    const keyclauses: string[] = [];
    const vals: any[] = [];

    if (beforeTs && beforeId) {
        vals.push(beforeTs, beforeId);
        keyclauses.push(`AND (created_at, id) < ($${vals.length - 1}::timestamptz, $${vals.length}::uuid)`);
    }

    return {
        keysetSQL: keyclauses.join(' '),
        keyParams: {
            values: vals,
            pageInfo: (rows: any[]) => ({
                has_more: rows.length === Number(query.limit || 50),
                next_before_ts: rows.length ? rows[rows.length - 1].created_at : null,
                next_before_id: rows.length ? rows[rows.length - 1].id : null
            })
        }
    };
}

export function validateFilters(input: any): string | null {
    if (input.from && isNaN(Date.parse(input.from))) {
        return 'Invalid from date format';
    }

    if (input.to && isNaN(Date.parse(input.to))) {
        return 'Invalid to date format';
    }

    if (input.min && isNaN(parseFloat(input.min))) {
        return 'Invalid min amount';
    }

    if (input.max && isNaN(parseFloat(input.max))) {
        return 'Invalid max amount';
    }

    return null;
}