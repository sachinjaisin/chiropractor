import { Pool, PoolClient } from 'pg';
import { env } from './env';
import { logger } from './logger';

let pool: Pool;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      min: env.DATABASE_POOL_MIN,
      max: env.DATABASE_POOL_MAX,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      statement_timeout: 30000,
    });

    pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected DB pool error');
    });

    pool.on('connect', () => {
      logger.debug('New DB connection established');
    });
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  values?: unknown[],
): Promise<T[]> {
  const start = Date.now();
  const result = await getPool().query(text, values);
  const duration = Date.now() - start;
  logger.debug({ query: text.slice(0, 80), duration, rows: result.rowCount }, 'DB query');
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  values?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, values);
  return rows[0] ?? null;
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
  }
}

export async function checkConnection(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
