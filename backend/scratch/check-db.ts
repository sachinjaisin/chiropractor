import 'dotenv/config';
import { query } from '../src/config/database';

async function checkDb() {
  try {
    const users = await query('SELECT id, email, first_name, last_name, role, is_active FROM users');
    console.log('--- Users ---');
    console.log(users);

    const practitioners = await query('SELECT id, user_id, status, warning_count FROM practitioners');
    console.log('\n--- Practitioners ---');
    console.log(practitioners);

    const statusHistory = await query('SELECT * FROM practitioner_status_history ORDER BY changed_at DESC LIMIT 10');
    console.log('\n--- Practitioner Status History ---');
    console.log(statusHistory);
  } catch (error) {
    console.error('Database query failed:', error);
  }
}

checkDb();
