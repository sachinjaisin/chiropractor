import { query } from '../config/database';
import { getRedis } from '../config/redis';
import { logger } from '../config/logger';

type NotificationType =
  | 'NEW_REFERRAL_AVAILABLE'
  | 'REFERRAL_CLAIMED'
  | 'REFERRAL_EXPIRED'
  | 'APPROVAL_APPROVED'
  | 'APPROVAL_REJECTED'
  | 'APPROVAL_SUSPENDED'
  | 'PASSWORD_RESET'
  | 'SUBSCRIPTION_RENEWED'
  | 'SUBSCRIPTION_PAST_DUE'
  | 'TOKENS_LOW';

interface NotificationInput {
  user_id:  string;
  type:     NotificationType;
  title:    string;
  body:     string;
  metadata?: Record<string, unknown>;
}

export class NotificationService {
  async create(input: NotificationInput): Promise<void> {
    const [notif] = await query(
      `INSERT INTO notifications (user_id, type, title, body, metadata)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [input.user_id, input.type, input.title, input.body, input.metadata ?? {}],
    );

    // Fan-out via Redis pub/sub to SSE connections
    const payload = JSON.stringify({
      event:          'notification',
      notification_id: notif.id,
      type:           input.type,
      title:          input.title,
    });

    try {
      await getRedis().publish(`sse:user:${input.user_id}`, payload);
    } catch (err) {
      logger.warn({ err }, 'Failed to publish SSE notification');
    }
  }

  async createBulk(notifications: NotificationInput[]): Promise<void> {
    await Promise.all(notifications.map(n => this.create(n)));
  }
}
