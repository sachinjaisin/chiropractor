import 'dotenv/config';
import { runMatchingEngine, expireReferral } from './matching.worker';
import { query, queryOne } from '../config/database';
import { referralMatchQueue, emailQueue } from '../queues';
import { getRedis } from '../config/redis';

jest.mock('../config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

jest.mock('../queues', () => ({
  referralMatchQueue: {
    add: jest.fn().mockResolvedValue({}),
  },
  emailQueue: {
    add: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../config/redis', () => {
  const mockRedis = {
    publish: jest.fn().mockResolvedValue(1),
  };
  return {
    getRedis: () => mockRedis,
    getQueueRedisOptions: () => ({ host: 'localhost', port: 6379 }),
    REDIS_DISABLED: false,
  };
});

describe('matching.worker', () => {
  const mockReferralId = 'ref-123';
  let dbState: {
    referralStatus: string;
    patientLocation: string | null;
    postgisExists: boolean;
    minActive: string;
    practitioners: any[];
    expiryHours: string;
    bufferKm: string;
    admins: any[];
    minMatchPercentage: string;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default db mock state for a standard happy path
    dbState = {
      referralStatus: 'NEW',
      patientLocation: 'POINT(-77.0365 38.8977)',
      postgisExists: true,
      minActive: '1',
      practitioners: [
        { id: 'prac-1', user_id: 'user-1', quality_score: 95.0, distance_km: 12.5, city: 'Seattle', zip_code: '98101', specialties: ['Back Pain'] },
        { id: 'prac-2', user_id: 'user-2', quality_score: 80.0, distance_km: 4.2, city: 'Tacoma', zip_code: '98402', specialties: ['Pediatrics'] },
      ],
      expiryHours: '72',
      bufferKm: '5',
      admins: [
        { email: 'admin1@test.com' },
        { email: 'admin2@test.com' },
      ],
      minMatchPercentage: '50',
    };

    // Setup robust mock implementation
    const handler = (sql: string, _params?: any[]) => {
      const cleaned = sql.replace(/\s+/g, ' ').trim();

      if (cleaned.includes('FROM referrals r JOIN patients p') || cleaned.includes('r.primary_complaint')) {
        if (dbState.referralStatus === 'NONE') return null;
        return {
          id: mockReferralId,
          patient_id: 'pat-123',
          status: dbState.referralStatus,
          urgency_level: 'NORMAL',
          primary_complaint: 'Back Pain',
          symptoms: 'Stiffness',
          patient_city: 'Seattle',
          patient_zip: '98101'
        };
      }
      // Fallback for older/simpler query if any
      if (cleaned.includes('SELECT id, patient_id, status, urgency_level')) {
        if (dbState.referralStatus === 'NONE') return null;
        return { id: mockReferralId, patient_id: 'pat-123', status: dbState.referralStatus, urgency_level: 'NORMAL' };
      }
      if (cleaned.includes('SELECT id, ST_AsText(location::geometry)')) {
        return { id: 'pat-123', location: dbState.patientLocation };
      }
      if (cleaned.includes("extname = 'postgis'")) {
        return { exists: dbState.postgisExists };
      }
      if (cleaned.includes("key = 'referral.visibility_radius_buffer_km'")) {
        return { value: dbState.bufferKm };
      }
      if (cleaned.includes("matching.rule_weights")) {
        return { value: { city_match: 30, zip_code_match: 40, specialty_match: 30 } };
      }
      if (cleaned.includes("matching.staggered_release_rules")) {
        return { value: { tiers: [{ min_score: 90, delay_minutes: 0 }, { min_score: 70, delay_minutes: 30 }, { min_score: 0, delay_minutes: 60 }] } };
      }
      if (cleaned.includes("matching.min_match_percentage")) {
        return { value: dbState.minMatchPercentage };
      }
      if (cleaned.includes('FROM system_settings WHERE key = $1') && _params) {
        const key = _params[0];
        if (key === 'matching.min_active_practitioners') {
          return { value: dbState.minActive };
        }
        if (key === 'referral.expiry_hours') {
          return { value: dbState.expiryHours };
        }
      }
      if (cleaned.includes('ST_DWithin') || cleaned.includes('ST_Distance') || cleaned.includes("status = 'ACTIVE'")) {
        return dbState.practitioners;
      }
      if (cleaned.includes('SELECT status FROM referrals WHERE id = $1')) {
        return { status: dbState.referralStatus };
      }
      if (cleaned.includes("role = 'admin'")) {
        return dbState.admins;
      }
      return [];
    };

    (query as jest.Mock).mockImplementation(async (sql: string, _params?: any[]) => {
      const res = handler(sql, _params);
      return Array.isArray(res) ? res : [res];
    });

    (queryOne as jest.Mock).mockImplementation(async (sql: string, _params?: any[]) => {
      const res = handler(sql, _params);
      return Array.isArray(res) ? res[0] ?? null : res;
    });
  });

  describe('runMatchingEngine', () => {
    it('should skip matching if referral is not found', async () => {
      dbState.referralStatus = 'NONE';

      await runMatchingEngine(mockReferralId);

      expect(query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO referral_visibility'),
        expect.any(Array)
      );
    });

    it('should skip matching if referral status is not NEW', async () => {
      dbState.referralStatus = 'OPEN';

      await runMatchingEngine(mockReferralId);

      expect(query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO referral_visibility'),
        expect.any(Array)
      );
    });

    it('should re-queue the match job if PostGIS is enabled but patient has no location yet', async () => {
      dbState.patientLocation = null;

      await runMatchingEngine(mockReferralId);

      expect(referralMatchQueue.add).toHaveBeenCalledWith(
        'run-matching-engine',
        { referral_id: mockReferralId },
        expect.objectContaining({ delay: 30000, priority: 2 })
      );
    });

    it('should run radius matching when PostGIS exists and patient is geocoded', async () => {
      await runMatchingEngine(mockReferralId);

      // Verify bulk insert into referral_visibility with exact match percentage score (only prac-1 >= 50% threshold)
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO referral_visibility'),
        [
          mockReferralId,
          'prac-1',
          100, // Seattle / 98101 / Back Pain -> 100% Match
          12.5,
          expect.any(Date),
        ]
      );

      // Verify status updated to OPEN
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE referrals SET status = 'OPEN'"),
        expect.any(Array)
      );

      // Verify Redis SSE publish triggered only for prac-1
      const redis = getRedis();
      expect(redis.publish).toHaveBeenCalledTimes(1);

      // Verify email notifications queued only for prac-1
      expect(emailQueue.add).toHaveBeenCalledTimes(1);

      // Verify expiry job scheduled
      expect(referralMatchQueue.add).toHaveBeenCalledWith(
        'expire-referral',
        { referral_id: mockReferralId },
        expect.objectContaining({ delay: 72 * 3600 * 1000 })
      );
    });

    it('should fallback to matching all active practitioners if PostGIS is not available', async () => {
      dbState.postgisExists = false;
      dbState.patientLocation = null;

      await runMatchingEngine(mockReferralId);

      // Verify bulk insert was still performed (only for prac-1 >= 50% threshold)
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO referral_visibility'),
        [
          mockReferralId,
          'prac-1',
          100,
          12.5,
          expect.any(Date),
        ]
      );
      // Verify update to status OPEN
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE referrals SET status = 'OPEN'"),
        expect.any(Array)
      );
    });

    it('should respect matching.min_active_practitioners setting', async () => {
      dbState.practitioners = [
        { id: 'prac-1', user_id: 'user-1', quality_score: 95.0, distance_km: 12.5, city: 'Seattle', zip_code: '98101', specialties: ['Back Pain'] },
      ];
      dbState.minActive = '2'; // requires 2 practitioners, but we only have 1

      await runMatchingEngine(mockReferralId);

      // Verify it did NOT insert visibility records since count < required min
      expect(query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO referral_visibility'),
        expect.any(Array)
      );
      expect(query).not.toHaveBeenCalledWith(
        expect.stringContaining("UPDATE referrals SET status = 'OPEN'"),
        expect.any(Array)
      );
    });

    it('should filter out practitioners below min_match_percentage threshold', async () => {
      // Both practitioners exist, but only prac-1 meets the 80% threshold
      dbState.minMatchPercentage = '80';

      await runMatchingEngine(mockReferralId);

      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO referral_visibility'),
        [
          mockReferralId,
          'prac-1',
          100,
          12.5,
          expect.any(Date),
        ]
      );
    });

    it('should abort matching if count of practitioners meeting threshold is less than min_active_practitioners', async () => {
      // Both practitioners exist, but minActive is 2.
      // Since prac-2 gets 0% match (below 50% threshold), only 1 practitioner meets the threshold.
      dbState.minActive = '2';
      dbState.minMatchPercentage = '50';

      await runMatchingEngine(mockReferralId);

      expect(query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO referral_visibility'),
        expect.any(Array)
      );
      expect(query).not.toHaveBeenCalledWith(
        expect.stringContaining("UPDATE referrals SET status = 'OPEN'"),
        expect.any(Array)
      );
    });
  });

  describe('expireReferral', () => {
    it('should skip expiration if referral is not OPEN', async () => {
      dbState.referralStatus = 'CLAIMED';

      await expireReferral(mockReferralId);

      expect(query).not.toHaveBeenCalledWith(
        expect.stringContaining("UPDATE referrals SET status = 'CLOSED'"),
        expect.any(Array)
      );
    });

    it('should expire referral and notify admins if status is OPEN', async () => {
      dbState.referralStatus = 'OPEN';

      await expireReferral(mockReferralId);

      // Verify status updated to CLOSED
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE referrals SET status = 'CLOSED'"),
        [mockReferralId]
      );

      // Verify visibility revoked
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE referral_visibility SET revoked_at = NOW()"),
        [mockReferralId]
      );

      // Verify emails queued for admins
      expect(emailQueue.add).toHaveBeenCalledTimes(2);
      expect(emailQueue.add).toHaveBeenCalledWith(
        'send-unclaimed-referral-alert',
        { admin_email: 'admin1@test.com', referral_id: mockReferralId }
      );
    });
  });
});
