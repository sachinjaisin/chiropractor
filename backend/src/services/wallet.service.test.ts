import 'dotenv/config';
import { WalletService } from './wallet.service';
import { query, queryOne } from '../config/database';
import { NotFoundError } from '../utils/errors';

jest.mock('../config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  withTransaction: jest.fn((fn) => fn({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    queryOne: jest.fn(),
  })),
}));

describe('WalletService', () => {
  let service: WalletService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WalletService();
  });

  describe('getWallet', () => {
    it('should return wallet if it exists', async () => {
      const mockWallet = { id: 'w-1', practitioner_id: 'p-1', balance: 10, total_used: 2 };
      (queryOne as jest.Mock).mockResolvedValue(mockWallet);

      const result = await service.getWallet('p-1');
      expect(result).toEqual(mockWallet);
      expect(queryOne).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM token_wallets'),
        ['p-1'],
      );
    });

    it('should throw NotFoundError if wallet does not exist', async () => {
      (queryOne as jest.Mock).mockResolvedValue(null);

      await expect(service.getWallet('p-1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('listPackages', () => {
    it('should return active packages ordered by sort_order', async () => {
      const mockPackages = [
        { id: 'pkg-1', token_count: 10, price_cents: 1500, stripe_price_id: 'price_1', sort_order: 1 },
        { id: 'pkg-2', token_count: 25, price_cents: 3500, stripe_price_id: 'price_2', sort_order: 2 },
      ];
      (query as jest.Mock).mockResolvedValue(mockPackages);

      const result = await service.listPackages();
      expect(result).toEqual({ data: mockPackages });
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, token_count, price_cents, stripe_price_id, sort_order FROM token_packages'),
      );
    });
  });

  describe('expireTokens', () => {
    it('should execute token expiry when credits exceed debits', async () => {
      const { withTransaction } = require('../config/database');
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ old_credits: 15 }] })
          .mockResolvedValueOnce({ rows: [{ total_debits: 5 }] })
          .mockResolvedValueOnce({ rows: [{ id: 'w-1', balance: 10, total_expired: 0 }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      (withTransaction as jest.Mock).mockImplementationOnce(async (fn: any) => fn(mockClient));

      const result = await service.expireTokens('prac-1', 12);
      expect(result).toBe(10);
      expect(mockClient.query).toHaveBeenCalledTimes(5);
    });

    it('should do nothing if pendingExpiry <= 0', async () => {
      const { withTransaction } = require('../config/database');
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ old_credits: 5 }] })
          .mockResolvedValueOnce({ rows: [{ total_debits: 10 }] }),
      };
      (withTransaction as jest.Mock).mockImplementationOnce(async (fn: any) => fn(mockClient));

      const result = await service.expireTokens('prac-1', 12);
      expect(result).toBe(0);
      expect(mockClient.query).toHaveBeenCalledTimes(2);
    });
  });
});
