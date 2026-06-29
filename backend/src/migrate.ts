import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { env } from './config/env';

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

interface Migration {
  version: string;
  filename: string;
  filepath: string;
}

async function getMigrations(): Promise<Migration[]> {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql') && !f.endsWith('.rollback.sql'))
    .sort();

  return files.map(filename => ({
    version: filename.replace('.sql', ''),
    filename,
    filepath: path.join(MIGRATIONS_DIR, filename),
  }));
}

async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const result = await pool.query<{ version: string }>('SELECT version FROM schema_migrations ORDER BY version');
  return new Set(result.rows.map(r => r.version));
}

async function runMigrations(pool: Pool, direction: 'up' | 'rollback'): Promise<void> {
  const migrations = await getMigrations();
  const applied = await getAppliedMigrations(pool);

  if (direction === 'up') {
    const pending = migrations.filter(m => !applied.has(m.version));
    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }
    for (const migration of pending) {
      console.log(`Applying migration: ${migration.version}`);
      const sql = fs.readFileSync(migration.filepath, 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migration.version]);
        await client.query('COMMIT');
        console.log(`  ✓ Applied: ${migration.version}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ Failed: ${migration.version}`, err);
        throw err;
      } finally {
        client.release();
      }
    }
  } else {
    const lastApplied = [...applied].sort().reverse()[0];
    if (!lastApplied) {
      console.log('No migrations to roll back.');
      return;
    }
    const migration = migrations.find(m => m.version === lastApplied);
    if (!migration) {
      console.error(`Migration file not found for version: ${lastApplied}`);
      process.exit(1);
    }
    console.log(`Rolling back: ${lastApplied}`);
    const rollbackFile = migration.filepath.replace('.sql', '.rollback.sql');
    if (!fs.existsSync(rollbackFile)) {
      console.error(`No rollback file found: ${rollbackFile}`);
      process.exit(1);
    }
    const sql = fs.readFileSync(rollbackFile, 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('DELETE FROM schema_migrations WHERE version = $1', [lastApplied]);
      await client.query('COMMIT');
      console.log(`  ✓ Rolled back: ${lastApplied}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

async function main() {
  const direction = process.argv[2] === 'rollback' ? 'rollback' : 'up';
  const pool = new Pool({ connectionString: env.DATABASE_URL });

  try {
    await runMigrations(pool, direction);
    console.log('Migration complete.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
