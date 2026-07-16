import 'dotenv/config';
import { AdminService } from './admin.service';

jest.mock('../config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  withTransaction: jest.fn((fn) => fn({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    queryOne: jest.fn(),
  })),
}));

jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('./stripe.service', () => {
  return {
    StripeService: jest.fn().mockImplementation(() => {
      return {
        isEnabled: jest.fn().mockReturnValue(false),
      };
    }),
  };
});

describe('AdminService Subscription Management', () => {
  let service: AdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminService();
  });

  describe('managePractitionerSubscription - ASSIGN_TRIAL', () => {
    it('should assign a free trial, cancel existing subscription, and allocate tokens', async () => {
      const { withTransaction } = require('../config/database');
      
      const mockPlan = {
        id: 'plan-123',
        name: 'Starter Trial',
        included_tokens: 5,
        stripe_price_id: 'price_starter_trial',
      };
      
      const mockExistingSub = {
        id: 'sub-existing',
        stripe_subscription_id: 'mock_existing_sub',
        status: 'ACTIVE',
      };

      const mockWallet = {
        id: 'wallet-123',
        balance: 10,
        total_allocated: 5,
      };

      const mockClient = {
        query: jest.fn()
          // 1. SELECT * FROM subscription_plans
          .mockResolvedValueOnce({ rows: [mockPlan] })
          // 2. SELECT * FROM subscriptions (existing active check)
          .mockResolvedValueOnce({ rows: [mockExistingSub] })
          // 3. UPDATE subscriptions (cancel old)
          .mockResolvedValueOnce({ rows: [] })
          // 4. INSERT INTO subscriptions (insert trial)
          .mockResolvedValueOnce({ rows: [] })
          // 5. SELECT * FROM token_wallets
          .mockResolvedValueOnce({ rows: [mockWallet] })
          // 6. UPDATE token_wallets
          .mockResolvedValueOnce({ rows: [] })
          // 7. INSERT INTO token_transactions
          .mockResolvedValueOnce({ rows: [] }),
      };

      (withTransaction as jest.Mock).mockImplementationOnce(async (fn: any) => fn(mockClient));

      const result = await service.managePractitionerSubscription(
        'prac-123',
        'plan-123',
        'ASSIGN_TRIAL',
        'admin-user',
        3 // 3 months duration
      );

      expect(result).toEqual({ status: 'ACTIVE', plan_name: 'Starter Trial' });
      
      // Ensure the old active subscription is cancelled
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE subscriptions SET status = 'CANCELLED'"),
        ['sub-existing']
      );

      // Ensure the new free trial is inserted
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO subscriptions"),
        expect.arrayContaining(['prac-123', 'plan-123'])
      );

      // Ensure wallet tokens are updated
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE token_wallets"),
        expect.arrayContaining([15, 10, 'wallet-123']) // balance becomes 15 (10+5), total_allocated becomes 10 (5+5)
      );

      // Ensure transaction is logged
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO token_transactions"),
        expect.arrayContaining(['wallet-123', 'prac-123', 5, 15])
      );
    });
  });

  describe('updatePlan', () => {
    it('should throw AppError if attempting to deactivate the Free subscription plan', async () => {
      const { queryOne } = require('../config/database');
      (queryOne as jest.Mock).mockResolvedValue({ name: 'Free', is_active: true });

      const { AppError } = require('../utils/errors');
      await expect(
        service.updatePlan('free-plan-id', { is_active: false }, 'admin-user')
      ).rejects.toThrow(AppError);
    });

    it('should allow other updates to the Free plan', async () => {
      const { queryOne } = require('../config/database');
      (queryOne as jest.Mock)
        .mockResolvedValueOnce({ name: 'Free', is_active: true })
        .mockResolvedValueOnce({ id: 'free-plan-id', name: 'Free', description: 'Updated Free plan' });

      const result = await service.updatePlan('free-plan-id', { description: 'Updated Free plan' }, 'admin-user');
      expect(result.description).toBe('Updated Free plan');
    });
  });
});
