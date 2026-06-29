import 'dotenv/config';
import { query, queryOne, closePool } from './config/database';

async function checkStats() {
  try {
    console.log('--- Database Config & Match Stats ---');
    
    // Check system settings
    const settings = await query('SELECT key, value FROM system_settings');
    console.log('System Settings:');
    settings.forEach(s => {
      console.log(`  ${s.key}:`, typeof s.value === 'string' ? s.value : JSON.stringify(s.value));
    });

    // Check total referrals
    const refCount = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM referrals');
    console.log(`Total Referrals in DB: ${refCount?.count}`);

    // Check visibility / matches in referral_visibility
    const matchesCount = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM referral_visibility');
    console.log(`Total Match Records in referral_visibility: ${matchesCount?.count}`);

    // Query match scores distribution
    console.log('\nMatch Score Distribution (from referral_visibility):');
    const scoreDist = await query<{ priority_score: number; count: string }>(
      'SELECT priority_score, COUNT(*) as count FROM referral_visibility GROUP BY priority_score ORDER BY priority_score DESC'
    );
    scoreDist.forEach(row => {
      console.log(`  Priority Score ${row.priority_score}%: ${row.count} matches`);
    });

    // Match counts per referral (grouped by referral)
    const refDistribution = await query<{ matches: number; count: string }>(
      `SELECT matches, COUNT(*) as count FROM (
         SELECT r.id, COUNT(rv.id) as matches 
         FROM referrals r 
         LEFT JOIN referral_visibility rv ON rv.referral_id = r.id 
         GROUP BY r.id
       ) t GROUP BY matches ORDER BY matches DESC`
    );
    console.log('\nReferral Match Count Distribution (Number of matches per referral):');
    refDistribution.forEach(row => {
      console.log(`  Referrals with ${row.matches} matches: ${row.count}`);
    });

  } catch (error) {
    console.error('Error running script:', error);
  } finally {
    await closePool();
  }
}

checkStats();
