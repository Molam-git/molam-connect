declare module '../../config/database' {
    import { Pool } from 'pg';
    export const db: Pool;
    export const testConnection: () => Promise<boolean>;
}