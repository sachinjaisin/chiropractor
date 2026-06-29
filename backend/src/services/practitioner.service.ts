import { query, queryOne } from '../config/database';
import { StorageService } from './storage.service';
import { geocodingQueue, emailQueue } from '../queues';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import { PractitionerRow, PractitionerProfileRow } from '../types';
import { encodeCursor, decodeCursor } from '../utils/cursor';
import { computeQualityScore } from '../workers/score.worker';
import { AuditService } from './audit.service';

interface ProfileInput {
  practice_name?:     string;
  practice_phone?:    string | null;
  practice_email?:    string | null;
  website?:           string | null;
  street_address?:    string;
  city?:              string;
  state?:             string;
  zip_code?:          string;
  bio?:               string | null;
  years_experience?:  number | null;
  languages_spoken?:  string[];
  service_radius_km?: number;
  areas_served?:      string[];
  specialties?:       string[];
  profile_pic_url?:   string | null;
}

export class PractitionerService {
  private storage = new StorageService();
  private audit   = new AuditService();

  async getOwnProfile(userId: string) {
    const row = await queryOne<PractitionerRow & PractitionerProfileRow & { email: string; first_name: string; last_name: string; profile_pic_url: string | null; profile_pic_key: string | null }>(
      `SELECT u.email, u.first_name, u.last_name, u.profile_pic_url,
              p.*,
              pp.*
       FROM users u
       JOIN practitioners p ON p.user_id = u.id
       LEFT JOIN practitioner_profiles pp ON pp.practitioner_id = p.id
       WHERE u.id = $1`,
      [userId],
    );
    if (!row) throw new NotFoundError('Practitioner');
    if (row.profile_pic_url) {
      row.profile_pic_key = row.profile_pic_url;
      row.profile_pic_url = await this.storage.getSignedDownloadUrl(row.profile_pic_url);
    } else {
      row.profile_pic_key = null;
    }
    return row;
  }

  async getPractitionerByUserId(userId: string): Promise<PractitionerRow | null> {
    return queryOne<PractitionerRow>(
      'SELECT * FROM practitioners WHERE user_id = $1',
      [userId],
    );
  }

  async updateProfile(userId: string, input: ProfileInput) {
    const practitioner = await queryOne<PractitionerRow>(
      'SELECT * FROM practitioners WHERE user_id = $1',
      [userId],
    );
    if (!practitioner) throw new NotFoundError('Practitioner');

    const existing = await queryOne<PractitionerProfileRow>(
      'SELECT * FROM practitioner_profiles WHERE practitioner_id = $1',
      [practitioner.id],
    );

    let profile: PractitionerProfileRow;

    if (!existing) {
      // First time — create profile
      const [created] = await query<PractitionerProfileRow>(
        `INSERT INTO practitioner_profiles
           (practitioner_id, practice_name, practice_phone, practice_email, website,
            street_address, city, state, zip_code, bio, years_experience,
            languages_spoken, service_radius_km, areas_served, specialties)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [
          practitioner.id,
          input.practice_name    ?? '',
          input.practice_phone   ?? null,
          input.practice_email   ?? null,
          input.website          ?? null,
          input.street_address   ?? '',
          input.city             ?? '',
          input.state            ?? '',
          input.zip_code         ?? '',
          input.bio              ?? null,
          input.years_experience ?? null,
          input.languages_spoken ?? [],
          input.service_radius_km ?? 40,
          input.areas_served     ?? [],
          input.specialties      ?? [],
        ],
      );
      profile = created;

      // Advance status if profile now complete — only from PENDING_PROFILE
      if (this.isProfileComplete(profile) && practitioner.status === 'PENDING_PROFILE') {
        await query(
          `UPDATE practitioners SET status = 'PROFILE_COMPLETED' WHERE id = $1`,
          [practitioner.id],
        );
        await query(
          `INSERT INTO practitioner_status_history (practitioner_id, old_status, new_status, changed_by, reason)
           VALUES ($1, 'PENDING_PROFILE', 'PROFILE_COMPLETED', $2, 'Profile completed by practitioner')`,
          [practitioner.id, practitioner.user_id],
        );
        await this.audit.log(null, {
          user_id:     practitioner.user_id,
          action:      'PROFILE_COMPLETED',
          entity_type: 'practitioner',
          entity_id:   practitioner.id,
          new_value:   { status: 'PROFILE_COMPLETED' },
        });

        const user = await queryOne<{ email: string; first_name: string }>(
          'SELECT email, first_name FROM users WHERE id = $1',
          [practitioner.user_id],
        );
        if (user) {
          await emailQueue.add('send-profile-completed', {
            type: 'send-profile-completed',
            to: user.email,
            first_name: user.first_name,
          }).catch(() => undefined);
        }
      }
    } else {
      // Update existing
      const setClauses: string[] = [];
      const values: unknown[]   = [];
      let idx = 1;

      const fields: (keyof ProfileInput)[] = [
        'practice_name', 'practice_phone', 'practice_email', 'website',
        'street_address', 'city', 'state', 'zip_code', 'bio',
        'years_experience', 'languages_spoken', 'service_radius_km',
        'areas_served', 'specialties',
      ];

      for (const field of fields) {
        if (input[field] !== undefined) {
          setClauses.push(`${field} = $${idx++}`);
          values.push(input[field]);
        }
      }

      if (setClauses.length === 0) return existing;

      values.push(practitioner.id);
      const [updated] = await query<PractitionerProfileRow>(
        `UPDATE practitioner_profiles SET ${setClauses.join(', ')} WHERE practitioner_id = $${idx} RETURNING *`,
        values,
      );
      profile = updated;

      // Advance status to PROFILE_COMPLETED — only from PENDING_PROFILE, never regress PENDING_APPROVAL
      if (this.isProfileComplete(profile) && practitioner.status === 'PENDING_PROFILE') {
        await query(
          `UPDATE practitioners SET status = 'PROFILE_COMPLETED' WHERE id = $1`,
          [practitioner.id],
        );
        await query(
          `INSERT INTO practitioner_status_history (practitioner_id, old_status, new_status, changed_by, reason)
           VALUES ($1, 'PENDING_PROFILE', 'PROFILE_COMPLETED', $2, 'Profile completed by practitioner')`,
          [practitioner.id, practitioner.user_id],
        );
        await this.audit.log(null, {
          user_id:     practitioner.user_id,
          action:      'PROFILE_COMPLETED',
          entity_type: 'practitioner',
          entity_id:   practitioner.id,
          new_value:   { status: 'PROFILE_COMPLETED' },
        });

        const user = await queryOne<{ email: string; first_name: string }>(
          'SELECT email, first_name FROM users WHERE id = $1',
          [practitioner.user_id],
        );
        if (user) {
          await emailQueue.add('send-profile-completed', {
            type: 'send-profile-completed',
            to: user.email,
            first_name: user.first_name,
          }).catch(() => undefined);
        }
      }
    }

    // Update profile_pic_url in users table if provided
    if (input.profile_pic_url !== undefined) {
      await query('UPDATE users SET profile_pic_url = $1 WHERE id = $2', [input.profile_pic_url, userId]);
    }

    // Trigger geocoding if address changed
    const addressChanged = input.street_address || input.city || input.state || input.zip_code;
    if (addressChanged) {
      await geocodingQueue.add('geocode-practitioner', {
        practitioner_id: practitioner.id,
        address: `${profile.street_address}, ${profile.city}, ${profile.state} ${profile.zip_code}`,
      });
    }

    // Compute effective status so frontend doesn't need a second GET
    const effectiveStatus =
      practitioner.status === 'PENDING_PROFILE' && this.isProfileComplete(profile)
        ? 'PROFILE_COMPLETED'
        : practitioner.status;

    let returnedProfilePicUrl: string | null = null;
    const user = await queryOne<{ profile_pic_url: string | null }>('SELECT profile_pic_url FROM users WHERE id = $1', [userId]);
    if (user?.profile_pic_url) {
      returnedProfilePicUrl = await this.storage.getSignedDownloadUrl(user.profile_pic_url);
    }

    return { ...profile, status: effectiveStatus, profile_pic_url: returnedProfilePicUrl };
  }

  async listDocuments(practitionerId: string) {
    const docs = await query(
      `SELECT id, document_type, original_filename, mime_type, file_size_bytes,
              verified_at, expires_at, created_at
       FROM practitioner_documents
       WHERE practitioner_id = $1
       ORDER BY created_at DESC`,
      [practitionerId],
    );
    return { data: docs };
  }

  async saveDocument(practitionerId: string, input: {
    document_type:     string;
    s3_key:            string;
    original_filename: string;
    mime_type:         string;
    file_size_bytes:   number;
  }) {
    const [doc] = await query(
      `INSERT INTO practitioner_documents
         (practitioner_id, document_type, s3_key, original_filename, mime_type, file_size_bytes)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, document_type, original_filename, mime_type, file_size_bytes, created_at`,
      [
        practitionerId,
        input.document_type,
        input.s3_key,
        input.original_filename,
        input.mime_type,
        input.file_size_bytes,
      ],
    );

    // Check if all required doc types are uploaded — advance status
    await this.checkAndAdvanceDocumentStatus(practitionerId);

    return doc;
  }

  async getDocumentDownloadUrl(practitionerId: string, docId: string): Promise<string> {
    const doc = await queryOne<{ s3_key: string; practitioner_id: string }>(
      'SELECT s3_key, practitioner_id FROM practitioner_documents WHERE id = $1',
      [docId],
    );
    if (!doc || doc.practitioner_id !== practitionerId) throw new ForbiddenError('Document not found');
    return this.storage.getSignedDownloadUrl(doc.s3_key);
  }

  async deleteDocument(practitionerId: string, docId: string): Promise<void> {
    const doc = await queryOne<{ s3_key: string; practitioner_id: string }>(
      'SELECT s3_key, practitioner_id FROM practitioner_documents WHERE id = $1',
      [docId],
    );
    if (!doc || doc.practitioner_id !== practitionerId) throw new ForbiddenError('Document not found');

    await this.storage.deleteDocument(doc.s3_key);
    await query('DELETE FROM practitioner_documents WHERE id = $1', [docId]);
  }

  async getPerformanceSummary(practitionerId: string) {
    // Run calculation on the fly to keep all dashboard cards completely dynamic and live
    await computeQualityScore(practitionerId).catch(err => {
      // eslint-disable-next-line no-console
      console.error('Failed to compute quality score on the fly:', err);
    });

    const [latest] = await query(
      `SELECT * FROM quality_scores WHERE practitioner_id = $1 ORDER BY score_date DESC LIMIT 1`,
      [practitionerId],
    );
    const stats = await queryOne<{ total: number; claimed: number; completed: number }>(
      `SELECT
         COUNT(DISTINCT rv.referral_id) AS total,
         COUNT(DISTINCT rc.referral_id) AS claimed,
         COUNT(DISTINCT r.id) FILTER (WHERE r.status IN ('COMPLETED', 'CLOSED') AND rc.referral_id IS NOT NULL) AS completed
       FROM referral_visibility rv
       JOIN referrals r ON r.id = rv.referral_id
       LEFT JOIN referral_claims rc ON rc.referral_id = r.id AND rc.practitioner_id = $1
       WHERE rv.practitioner_id = $1`,
      [practitionerId],
    );
    return { quality_score: latest, stats };
  }

  async listNotifications(userId: string, cursor?: string, limit = 20) {
    const safeLimit = Math.min(limit, 50);
    let cursorWhere = '';
    const params: unknown[] = [userId, safeLimit + 1];

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        cursorWhere = 'AND (created_at, id) < ($3::timestamptz, $4::uuid)';
        params.push(decoded.created_at, decoded.id);
      }
    }

    const rows = await query(
      `SELECT id, type, title, body, metadata, is_read, created_at
       FROM notifications
       WHERE user_id = $1 ${cursorWhere}
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      params,
    );

    const hasNext = rows.length > safeLimit;
    const data    = hasNext ? rows.slice(0, safeLimit) : rows;
    const last    = data[data.length - 1] as { id: string; created_at: Date } | undefined;

    return {
      data,
      pagination: {
        cursor:   last ? encodeCursor(last.id, last.created_at) : null,
        has_next: hasNext,
        limit:    safeLimit,
      },
    };
  }

  async markNotificationRead(userId: string, notificationId: string): Promise<void> {
    await query(
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = $1 AND user_id = $2',
      [notificationId, userId],
    );
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await query(
      'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = $1 AND is_read = FALSE',
      [userId],
    );
  }

  private isProfileComplete(profile: Partial<PractitionerProfileRow>): boolean {
    return !!(profile.practice_name && profile.street_address && profile.city && profile.state && profile.zip_code);
  }

  private async checkAndAdvanceDocumentStatus(practitionerId: string): Promise<void> {
    const required = ['LICENSE', 'INSURANCE'];
    const uploaded = await query<{ document_type: string }>(
      'SELECT DISTINCT document_type FROM practitioner_documents WHERE practitioner_id = $1',
      [practitionerId],
    );
    const uploadedTypes = new Set(uploaded.map(d => d.document_type));
    const allRequired   = required.every(t => uploadedTypes.has(t));

    if (allRequired) {
      const practitioner = await queryOne<{ status: string; user_id: string }>(
        'SELECT status, user_id FROM practitioners WHERE id = $1',
        [practitionerId]
      );
      if (practitioner && practitioner.status === 'PROFILE_COMPLETED') {
        await query(
          `UPDATE practitioners SET status = 'PENDING_APPROVAL' WHERE id = $1`,
          [practitionerId],
        );
        await query(
          `INSERT INTO practitioner_status_history (practitioner_id, old_status, new_status, changed_by, reason)
           VALUES ($1, 'PROFILE_COMPLETED', 'PENDING_APPROVAL', $2, 'Required documents uploaded')`,
          [practitionerId, practitioner.user_id],
        );
        await this.audit.log(null, {
          user_id:     practitioner.user_id,
          action:      'PENDING_APPROVAL',
          entity_type: 'practitioner',
          entity_id:   practitionerId,
          new_value:   { status: 'PENDING_APPROVAL' },
        });
        await emailQueue.add('notify-admin-new-application', {
          practitioner_id: practitionerId,
        });
        await emailQueue.add('send-approval-status', {
          practitioner_id: practitionerId,
          status:          'PENDING_APPROVAL',
        });
      }
    }
  }

  async updateProfilePic(userId: string, s3Key: string | null): Promise<void> {
    await query('UPDATE users SET profile_pic_url = $1 WHERE id = $2', [s3Key, userId]);
  }
}
