import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, queryOne, withTransaction } from '../config/database';
import { getRedis, isRedisAvailable } from '../config/redis';
import { env } from '../config/env';
import { hashPassword, verifyPassword, generateToken, hashToken } from '../utils/crypto';
import { UserRow, PractitionerRow, JwtPayload, UserRole } from '../types';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  ValidationError,
} from '../utils/errors';
import { emailQueue } from '../queues';
import { AuditService } from './audit.service';
import { StorageService } from './storage.service';

interface RegisterInput {
  first_name: string;
  last_name:  string;
  email:      string;
  phone:      string;
  password:   string;
}

interface TokenPair {
  access_token:  string;
  refresh_token: string;
}

export class AuthService {
  private audit   = new AuditService();
  private storage = new StorageService();

  async register(input: RegisterInput): Promise<{ user: Partial<UserRow> }> {
    const existing = await queryOne<UserRow>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1)',
      [input.email],
    );
    if (existing) throw new ConflictError('An account with this email already exists');

    const passwordHash = await hashPassword(input.password);

    const result = await withTransaction(async (client) => {
      const [user] = await client.query<UserRow>(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
         VALUES ($1, $2, $3, $4, $5, 'chiropractor')
         RETURNING id, email, first_name, last_name, role, created_at`,
        [input.email.toLowerCase(), passwordHash, input.first_name, input.last_name, input.phone],
      ).then(r => r.rows);

      // Create practitioner record — starts in PENDING_PROFILE for admin review
      const [practitioner] = await client.query<PractitionerRow>(
        `INSERT INTO practitioners (user_id, status) VALUES ($1, 'PENDING_PROFILE') RETURNING id`,
        [user.id],
      ).then(r => r.rows);

      // Log initial status in history
      await client.query(
        `INSERT INTO practitioner_status_history (practitioner_id, old_status, new_status, changed_by, reason)
         VALUES ($1, NULL, 'PENDING_PROFILE', $2, 'Practitioner registered account')`,
        [practitioner.id, user.id],
      );

      // Create empty wallet
      await client.query(
        `INSERT INTO token_wallets (practitioner_id) VALUES ($1)`,
        [practitioner.id],
      );

      await this.audit.log(client, {
        user_id:     user.id,
        action:      'REGISTER',
        entity_type: 'user',
        entity_id:   user.id,
        new_value:   { email: user.email, role: 'chiropractor' },
      });

      return { user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, role: user.role, created_at: user.created_at } };
    });

    if (result.user.email && result.user.first_name) {
      await emailQueue.add('send-welcome', {
        type: 'send-welcome',
        to: result.user.email,
        first_name: result.user.first_name,
      }).catch(err => {
        // non-blocking
        console.error('Failed to queue welcome email:', err);
      });
    }

    return result;
  }

  async login(email: string, password: string): Promise<TokenPair & { practitioner_id?: string; user: object }> {
    const user = await queryOne<UserRow & { practitioner_id?: string; practitioner_status?: string; rejection_reason?: string }>(
      `SELECT u.*, p.id AS practitioner_id, p.status AS practitioner_status,
              (SELECT reason 
               FROM practitioner_status_history 
               WHERE practitioner_id = p.id AND new_status = 'REJECTED' 
               ORDER BY changed_at DESC LIMIT 1) AS rejection_reason
       FROM users u
       LEFT JOIN practitioners p ON p.user_id = u.id
       WHERE LOWER(u.email) = LOWER($1) AND u.is_active = TRUE`,
      [email],
    );

    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Update last login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const tokens = this.generateTokenPair(user);

    // Store refresh token hash in Redis (sliding expiry) — no-op if Redis is down
    const refreshHash = hashToken(tokens.refresh_token);
    try {
      await getRedis().setex(
        `refresh:${user.id}:${refreshHash}`,
        env.JWT_REFRESH_EXPIRES_IN,
        '1',
      );
    } catch { /* Redis unavailable — token rotation disabled */ }

    let signedProfilePicUrl: string | null = null;
    let profilePicKey: string | null = null;
    if (user.profile_pic_url) {
      profilePicKey = user.profile_pic_url;
      signedProfilePicUrl = await this.storage.getSignedDownloadUrl(user.profile_pic_url);
    }

    return {
      ...tokens,
      practitioner_id: user.practitioner_id,
      user: {
        id:                  user.id,
        email:               user.email,
        first_name:          user.first_name,
        last_name:           user.last_name,
        role:                user.role,
        practitioner_id:     user.practitioner_id,
        practitioner_status: user.practitioner_status,
        rejection_reason:    user.rejection_reason,
        profile_pic_url:     signedProfilePicUrl,
        profile_pic_key:     profilePicKey,
      },
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenPair & { user: object }> {
    let payload: JwtPayload;
    try {
      payload = jwt.verify(refreshToken, env.JWT_SECRET) as JwtPayload;
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    // Skip Redis rotation check when Redis is unavailable
    try {
      if (isRedisAvailable()) {
        const refreshHash = hashToken(refreshToken);
        const key         = `refresh:${payload.sub}:${refreshHash}`;
        const exists      = await getRedis().get(key);

        if (!exists) {
          await getRedis().del(`refresh:${payload.sub}:*`);
          throw new UnauthorizedError('Refresh token reuse detected. Please log in again.');
        }
        await getRedis().del(key);
      }
    } catch (err) {
      if ((err as { message?: string }).message?.includes('Refresh token reuse')) throw err;
      // Redis unavailable — skip rotation enforcement
    }

    const user = await queryOne<UserRow & { practitioner_id?: string; practitioner_status?: string; rejection_reason?: string }>(
      `SELECT u.*, p.id AS practitioner_id, p.status AS practitioner_status,
              (SELECT reason 
               FROM practitioner_status_history 
               WHERE practitioner_id = p.id AND new_status = 'REJECTED' 
               ORDER BY changed_at DESC LIMIT 1) AS rejection_reason
       FROM users u
       LEFT JOIN practitioners p ON p.user_id = u.id
       WHERE u.id = $1 AND u.is_active = TRUE`,
      [payload.sub],
    );
    if (!user) throw new UnauthorizedError('User not found or inactive');

    const tokens  = this.generateTokenPair(user);
    const newHash = hashToken(tokens.refresh_token);
    try {
      await getRedis().setex(
        `refresh:${user.id}:${newHash}`,
        env.JWT_REFRESH_EXPIRES_IN,
        '1',
      );
    } catch { /* Redis unavailable */ }

    let signedProfilePicUrl: string | null = null;
    let profilePicKey: string | null = null;
    if (user.profile_pic_url) {
      profilePicKey = user.profile_pic_url;
      signedProfilePicUrl = await this.storage.getSignedDownloadUrl(user.profile_pic_url);
    }

    return {
      ...tokens,
      user: {
        id:                  user.id,
        email:               user.email,
        first_name:          user.first_name,
        last_name:           user.last_name,
        role:                user.role,
        practitioner_id:     user.practitioner_id,
        practitioner_status: user.practitioner_status,
        rejection_reason:    user.rejection_reason,
        profile_pic_url:     signedProfilePicUrl,
        profile_pic_key:     profilePicKey,
      },
    };
  }

  async logout(jti: string, exp: number): Promise<void> {
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      try {
        await getRedis().setex(`revoked:${jti}`, ttl, '1');
      } catch { /* Redis unavailable — token not revoked */ }
    }
  }

  /** Deletes the refresh token from Redis so it cannot be reused. */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    try {
      const payload = jwt.decode(refreshToken) as { sub?: string } | null;
      if (!payload?.sub) return;
      const refreshHash = hashToken(refreshToken);
      await getRedis().del(`refresh:${payload.sub}:${refreshHash}`);
    } catch { /* ignore */ }
  }

  /** Parses a raw access token (without verification errors being fatal)
   *  and blacklists its JTI in Redis for its remaining TTL. */
  async revokeAccessTokenFromHeader(rawToken: string): Promise<void> {
    try {
      const payload = jwt.verify(rawToken, env.JWT_SECRET) as JwtPayload;
      const ttl = payload.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await getRedis().setex(`revoked:${payload.jti}`, ttl, '1');
      }
    } catch { /* token expired or invalid — nothing to revoke */ }
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await queryOne<UserRow>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE',
      [email],
    );
    if (!user) return; // Silently ignore unknown emails

    const token     = generateToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

    // Invalidate previous tokens
    await query(
      'UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL',
      [user.id],
    );

    await query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt],
    );

    await emailQueue.add('send-password-reset', {
      to:    email,
      token: token,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const record    = await queryOne<{ id: string; user_id: string; expires_at: Date; used_at: Date | null }>(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = $1`,
      [tokenHash],
    );

    if (!record || record.used_at || record.expires_at < new Date()) {
      throw new ValidationError('Invalid or expired reset token');
    }

    const user = await queryOne<{ email: string; first_name: string }>(
      'SELECT email, first_name FROM users WHERE id = $1',
      [record.user_id],
    );

    const passwordHash = await hashPassword(newPassword);
    await withTransaction(async (client) => {
      await client.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [passwordHash, record.user_id],
      );
      await client.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
        [record.id],
      );
    });

    if (user) {
      await emailQueue.add('send-password-reset-success', {
        type: 'send-password-reset-success',
        to: user.email,
        first_name: user.first_name,
      }).catch(err => {
        // non-blocking
        console.error('Failed to queue password reset success email:', err);
      });
    }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await queryOne<UserRow>('SELECT * FROM users WHERE id = $1', [userId]);
    if (!user) throw new NotFoundError('User');

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) throw new ValidationError('Current password is incorrect');

    const passwordHash = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
  }

  private generateTokenPair(user: {
    id: string;
    role: UserRole;
    practitioner_id?: string;
    practitioner_status?: string;
  }): TokenPair {
    const jti = crypto.randomUUID();

    const accessPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub:                  user.id,
      role:                 user.role,
      practitioner_id:      user.practitioner_id,
      practitioner_status:  user.practitioner_status as JwtPayload['practitioner_status'],
      jti,
    };

    const access_token = jwt.sign(accessPayload, env.JWT_SECRET, {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    });

    const refresh_token = jwt.sign(
      { sub: user.id, jti: crypto.randomUUID(), type: 'refresh' },
      env.JWT_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN },
    );

    return { access_token, refresh_token };
  }
}
