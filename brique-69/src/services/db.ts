import { Pool, PoolClient, QueryResult } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });

    console.log('✅ Database pool initialized');
  }

  return pool;
}

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await getPool().query<T>(text, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
      console.warn(`Slow query (${duration}ms):`, text.slice(0, 100));
    }

    return result;
  } catch (error) {
    console.error('Database query error:', error);
    console.error('Query:', text);
    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database pool closed');
  }
}

// Helper to get region from country
export async function getRegionForCountry(country: string): Promise<string> {
  const result = await query<{ region: string }>(
    'SELECT get_region_from_country($1) as region',
    [country]
  );
  return result.rows[0]?.region || 'GLOBAL';
}

// Helper to get FX rate
export async function getFXRate(
  date: string,
  baseCurrency: string,
  quoteCurrency: string = 'USD'
): Promise<number> {
  const result = await query<{ rate: string }>(
    'SELECT rate FROM fx_rates WHERE as_of_date = $1 AND base_currency = $2 AND quote_currency = $3',
    [date, baseCurrency, quoteCurrency]
  );

  return result.rows[0]?.rate ? parseFloat(result.rows[0].rate) : 1.0;
}
