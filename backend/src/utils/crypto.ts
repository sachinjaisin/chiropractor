import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { env } from '../config/env';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateFeedbackToken(referralId: string, patientId: string): string {
  const payload = `${referralId}:${patientId}`;
  return crypto
    .createHmac('sha256', env.FEEDBACK_TOKEN_SECRET)
    .update(payload)
    .digest('hex');
}

export function verifyFeedbackToken(
  token: string,
  referralId: string,
  patientId: string,
): boolean {
  const expected = generateFeedbackToken(referralId, patientId);
  const tokenBuf = Buffer.from(token);
  const expectedBuf = Buffer.from(expected);
  if (tokenBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(tokenBuf, expectedBuf);
}
