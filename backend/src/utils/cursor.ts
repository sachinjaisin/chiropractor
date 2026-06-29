import { CursorPayload } from '../types';

export function encodeCursor(id: string, createdAt: Date): string {
  const payload: CursorPayload = { id, created_at: createdAt.toISOString() };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const payload = JSON.parse(json) as CursorPayload;
    if (!payload.id || !payload.created_at) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildCursorWhere(
  cursor: string | undefined,
  tableAlias = '',
): { sql: string; params: unknown[] } {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  if (!cursor) return { sql: '', params: [] };
  const decoded = decodeCursor(cursor);
  if (!decoded) return { sql: '', params: [] };
  return {
    sql: `AND (${prefix}created_at, ${prefix}id) < ($1::timestamptz, $2::uuid)`,
    params: [decoded.created_at, decoded.id],
  };
}
