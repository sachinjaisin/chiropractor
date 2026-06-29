import crypto from 'crypto';
import { PoolClient } from 'pg';
import { query as dbQuery } from '../config/database';

interface AuditEntry {
  user_id?:     string;
  action:       string;
  entity_type:  string;
  entity_id?:   string;
  ip_address?:  string;
  user_agent?:  string;
  old_value?:   unknown;
  new_value?:   unknown;
}

export class AuditService {
  async log(clientOrNull: PoolClient | null, entry: AuditEntry): Promise<void> {
    const sql = `
      INSERT INTO audit_logs
        (user_id, action, entity_type, entity_id, ip_address, user_agent, old_value, new_value, row_hash)
      VALUES ($1, $2, $3, $4, $5::inet, $6, $7, $8, $9)
    `;

    const rowContent = JSON.stringify({
      user_id:     entry.user_id,
      action:      entry.action,
      entity_type: entry.entity_type,
      entity_id:   entry.entity_id,
      new_value:   entry.new_value,
      ts:          new Date().toISOString(),
    });
    const rowHash = crypto.createHash('sha256').update(rowContent).digest('hex');

    const params = [
      entry.user_id     ?? null,
      entry.action,
      entry.entity_type,
      entry.entity_id   ?? null,
      entry.ip_address  ?? null,
      entry.user_agent  ?? null,
      entry.old_value   ? JSON.stringify(entry.old_value) : null,
      entry.new_value   ? JSON.stringify(entry.new_value) : null,
      rowHash,
    ];

    if (clientOrNull) {
      await clientOrNull.query(sql, params);
    } else {
      await dbQuery(sql, params);
    }
  }
}
