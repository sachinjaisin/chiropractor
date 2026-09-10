import 'dotenv/config';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  const email = process.env.ADMIN_EMAIL || process.env.ADMIN_SEED_EMAIL || 'admin@vitalitygroup.com.au';
  const providedPassword = process.env.ADMIN_PASSWORD || process.env.ADMIN_SEED_PASSWORD;
  const isGenerated = !providedPassword;
  const password = providedPassword || crypto.randomBytes(16).toString('hex') + 'A1!';
  
  const hash = await bcrypt.hash(password, 12);

  // Check if admin user exists
  const res = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (res.rows.length === 0) {
    await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified, is_active)
       VALUES ($1, $2, 'Vitality', 'Admin', 'admin', true, true)`,
      [email, hash]
    );
    if (isGenerated) {
      console.log(`Created admin user: ${email} with generated password: [REDACTED_SECURE_PASSWORD]`);
    } else {
      console.log(`Created admin user: ${email}`);
    }
  } else {
    await pool.query(
      `UPDATE users SET role = 'admin', password_hash = $1, is_active = true WHERE email = $2`,
      [hash, email]
    );
    console.log(`Updated admin user password and role: ${email}`);
  }

  // If a command-line argument is passed, promote that email to admin as well
  const targetEmail = process.argv[2];
  if (targetEmail) {
    const userRes = await pool.query('SELECT id, role FROM users WHERE email = $1', [targetEmail]);
    if (userRes.rows.length > 0) {
      await pool.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [targetEmail]);
      console.log(`Successfully promoted ${targetEmail} to admin.`);
    } else {
      console.log(`User with email ${targetEmail} not found.`);
    }
  }

  await pool.end();
}

seed().catch(console.error);
