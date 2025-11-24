import { PaginationInfo } from "@/shared/types";

export interface FilterInput {
    from?: string;
    to?: string;
    type?: string;
    status?: string;
    min?: string;
    max?: string;
    currency?: string;
    country?: string;
    channel?: string;
    q?: string;
    scope: 'user' | 'merchant' | 'admin';
    userId?: string;
    merchantId?: string;
}

export interface KeysetPagination {
    keysetSQL: string;
    keyParams: {
        values: any[];
        pageInfo: (rows: any[]) => PaginationInfo;
    };
}

export interface ExportOptions {
    title: string;
    format: 'csv' | 'pdf';
    includeHash?: boolean;
}