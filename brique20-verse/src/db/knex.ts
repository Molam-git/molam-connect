import knex from 'knex';
import { config } from '../config.js';

export const db = knex({
    client: 'pg',
    connection: config.db.connection,
    pool: { min: 2, max: 20 }
});