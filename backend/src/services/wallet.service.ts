import { query, queryOne, withTransaction } from '../config/database';
import { StripeService } from './stripe.service';
import { NotFoundError, AppError } from '../utils/errors';
import { TokenWalletRow, TokenTransactionRow } from '../types';
import { encodeCursor, decodeCursor } from '../utils/cursor';
import crypto from 'crypto';
import { emailQueue } from '../queues';

export interface TokenPackage {
  id: string;
  token_count: number;
  price_cents: number;
  stripe_price_id: string;
  sort_order: number;
}

export class WalletService {
  private stripeSvc = new StripeService();

  /** Get wallet details for a practitioner */
  async getWallet(practitionerId: string): Promise<TokenWalletRow> {
    const wallet = await queryOne<TokenWalletRow>(
      `SELECT * FROM token_wallets WHERE practitioner_id = $1`,
      [practitionerId],
    );
    if (!wallet) throw new NotFoundError('Wallet');
    return wallet;
  }

  /** List transaction history for a practitioner's wallet */
  async listTransactions(practitionerId: string, cursor?: string, limit = 20) {
    const lim = Math.min(limit, 50);
    const params: unknown[] = [practitionerId, lim + 1];
    let cursorWhere = '';

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        cursorWhere = 'AND (created_at, id) < ($3::timestamptz, $4::uuid)';
        params.push(decoded.created_at, decoded.id);
      }
    }

    const rows = await query<TokenTransactionRow>(
      `SELECT * FROM token_transactions
       WHERE practitioner_id = $1 ${cursorWhere}
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      params,
    );

    const hasNext = rows.length > lim;
    const data = hasNext ? rows.slice(0, lim) : rows;
    const last = data[data.length - 1];

    return {
      data,
      pagination: {
        cursor: last ? encodeCursor(last.id, last.created_at) : null,
        has_next: hasNext,
        limit: lim,
      },
    };
  }

  /** List available token packages */
  async listPackages(): Promise<{ data: TokenPackage[] }> {
    const disabledSetting = await queryOne<{ value: any }>(
      `SELECT value FROM system_settings WHERE key = 'token.buying_disabled'`
    );
    if (disabledSetting && disabledSetting.value === true) {
      return { data: [] };
    }

    const packages = await query<TokenPackage>(
      `SELECT id, token_count, price_cents, stripe_price_id, sort_order FROM token_packages WHERE is_active = TRUE ORDER BY sort_order ASC`,
    );
    return { data: packages };
  }

  /** Purchase tokens package via Stripe Checkout */
  async purchaseTokens(
    practitionerId: string,
    packageId: string,
    successUrl: string,
    cancelUrl: string,
  ): Promise<{ checkout_url: string }> {
    const disabledSetting = await queryOne<{ value: any }>(
      `SELECT value FROM system_settings WHERE key = 'token.buying_disabled'`
    );
    if (disabledSetting && disabledSetting.value === true) {
      throw new AppError(403, 'FORBIDDEN', 'Token purchases are currently disabled.');
    }

    // Fetch package details
    const pkg = await queryOne<TokenPackage>(
      `SELECT id, token_count, price_cents, stripe_price_id FROM token_packages WHERE id = $1 AND is_active = TRUE`,
      [packageId],
    );
    if (!pkg) throw new NotFoundError('Token package');

    // Get user email for Stripe
    const user = await queryOne<{ email: string }>(
      `SELECT u.email FROM users u JOIN practitioners p ON p.user_id = u.id WHERE p.id = $1`,
      [practitionerId],
    );
    if (!user) throw new NotFoundError('Practitioner user');

    if (this.stripeSvc.isEnabled()) {
      try {
        const customerId = await this.stripeSvc.getOrCreateCustomer(practitionerId, user.email);
        const session = await this.stripeSvc.createCheckoutSession({
          customerId,
          priceId: pkg.stripe_price_id,
          mode: 'payment',
          successUrl,
          cancelUrl,
          metadata: {
            practitioner_id: practitionerId,
            package_id: packageId,
          },
        });
        return { checkout_url: session.url! };
      } catch (err: any) {
        if (err.message && err.message.includes('No such price')) {
          throw new AppError(
            400,
            'STRIPE_CONFIG_ERROR',
            `Stripe Price ID '${pkg.stripe_price_id}' does not exist in your Stripe account. Please create it in Stripe Dashboard or update the token_packages database table.`,
          );
        }
        throw err;
      }
    }

    // Mock mode: immediately credit tokens locally and return successUrl
    const paymentIntentId = 'mock_pi_' + crypto.randomUUID().slice(0, 8);
    await this.completeTokenPurchase(practitionerId, packageId, paymentIntentId);
    return { checkout_url: successUrl };
  }

  /** Atomic confirmation of token package purchase from webhook */
  async completeTokenPurchase(
    practitionerId: string,
    packageId: string,
    paymentIntentId: string,
    amountUsdCents?: number,
  ): Promise<void> {
    const pkg = await queryOne<TokenPackage>(
      `SELECT id, token_count, price_cents FROM token_packages WHERE id = $1 AND is_active = TRUE`,
      [packageId],
    );
    if (!pkg) throw new NotFoundError('Token package');

    const usdCents = amountUsdCents ?? pkg.price_cents;

    const user = await queryOne<{ email: string; first_name: string }>(
      `SELECT u.email, u.first_name FROM users u JOIN practitioners p ON p.user_id = u.id WHERE p.id = $1`,
      [practitionerId],
    );

    // Update wallet balance and insert transaction atomically
    const result = await withTransaction(async (client) => {
      let [wallet] = await client.query<TokenWalletRow>(
        `SELECT * FROM token_wallets WHERE practitioner_id = $1 FOR UPDATE`,
        [practitionerId],
      ).then(r => r.rows);

      if (!wallet) {
        [wallet] = await client.query<TokenWalletRow>(
          `INSERT INTO token_wallets (practitioner_id, balance, total_purchased)
           VALUES ($1, 0, 0) RETURNING *`,
          [practitionerId],
        ).then(r => r.rows);
      }

      // Idempotency check using the Stripe PaymentIntent ID
      const [existingTx] = await client.query<TokenTransactionRow>(
        `SELECT id FROM token_transactions WHERE stripe_payment_intent_id = $1`,
        [paymentIntentId],
      ).then(r => r.rows);
      if (existingTx) return { skipped: true };

      const newBalance = wallet.balance + pkg.token_count;
      const totalPurchased = wallet.total_purchased + pkg.token_count;

      await client.query(
        `UPDATE token_wallets
         SET balance = $1, total_purchased = $2, updated_at = NOW()
         WHERE id = $3`,
        [newBalance, totalPurchased, wallet.id],
      );

      await client.query(
        `INSERT INTO token_transactions
           (wallet_id, practitioner_id, transaction_type, amount, balance_after, stripe_payment_intent_id, notes, amount_usd_cents)
         VALUES ($1, $2, 'PURCHASE', $3, $4, $5, $6, $7)`,
        [
          wallet.id,
          practitionerId,
          pkg.token_count,
          newBalance,
          paymentIntentId,
          `Purchased ${pkg.token_count} tokens package`,
          usdCents,
        ],
      );

      return { skipped: false, newBalance };
    });

    if (result && !result.skipped && user) {
      await emailQueue.add('send-token-transaction', {
        type: 'send-token-transaction',
        to: user.email,
        first_name: user.first_name,
        transaction_type: 'PURCHASE',
        amount: pkg.token_count,
        balance_after: result.newBalance!,
        notes: `Purchased ${pkg.token_count} tokens package`,
      }).catch(() => undefined);
    }
  }

  /** Adjust balance atomically – used internally by claim flow */
  async adjustBalance(practitionerId: string, delta: number) {
    return withTransaction(async (client) => {
      const [wallet] = await client.query<TokenWalletRow>(
        `SELECT id, balance, total_used FROM token_wallets WHERE practitioner_id = $1 FOR UPDATE`,
        [practitionerId],
      ).then(r => r.rows);

      if (!wallet) throw new NotFoundError('Wallet');
      const newBalance = wallet.balance + delta;
      if (newBalance < 0) {
        throw new Error('Insufficient token balance');
      }
      await client.query(
        `UPDATE token_wallets SET balance = $1, total_used = total_used + $2 WHERE id = $3`,
        [newBalance, Math.abs(delta), wallet.id],
      );
      return { balance: newBalance };
    });
  }

  /** Allocate monthly subscription plan tokens to practitioner */
  async allocateMonthlyTokens(practitionerId: string, tokens: number, amountUsdCents?: number, stripeInvoiceId?: string) {
    const user = await queryOne<{ email: string; first_name: string }>(
      `SELECT u.email, u.first_name FROM users u JOIN practitioners p ON p.user_id = u.id WHERE p.id = $1`,
      [practitionerId],
    );

    const result = await withTransaction(async (client) => {
      let [wallet] = await client.query<TokenWalletRow>(
        `SELECT * FROM token_wallets WHERE practitioner_id = $1 FOR UPDATE`,
        [practitionerId],
      ).then(r => r.rows);

      if (!wallet) {
        [wallet] = await client.query<TokenWalletRow>(
          `INSERT INTO token_wallets (practitioner_id, balance, total_allocated)
           VALUES ($1, 0, 0) RETURNING *`,
          [practitionerId],
        ).then(r => r.rows);
      }

      // Check idempotency if stripeInvoiceId is provided
      if (stripeInvoiceId) {
        const [existingTx] = await client.query<TokenTransactionRow>(
          `SELECT id FROM token_transactions WHERE stripe_payment_intent_id = $1`,
          [stripeInvoiceId],
        ).then(r => r.rows);
        if (existingTx) return { skipped: true, balance: wallet.balance };
      }

      const newBalance = wallet.balance + tokens;
      const totalAllocated = wallet.total_allocated + tokens;

      await client.query(
        `UPDATE token_wallets
         SET balance = $1, total_allocated = $2, updated_at = NOW()
         WHERE id = $3`,
        [newBalance, totalAllocated, wallet.id],
      );

      await client.query(
        `INSERT INTO token_transactions
           (wallet_id, practitioner_id, transaction_type, amount, balance_after, notes, amount_usd_cents, stripe_payment_intent_id)
         VALUES ($1, $2, 'MONTHLY_ALLOCATION', $3, $4, $5, $6, $7)`,
        [
          wallet.id,
          practitionerId,
          tokens,
          newBalance,
          `Monthly allocation of ${tokens} tokens`,
          amountUsdCents ?? null,
          stripeInvoiceId ?? null,
        ],
      );

      return { skipped: false, balance: newBalance };
    });

    if (!result.skipped && user) {
      await emailQueue.add('send-token-transaction', {
        type: 'send-token-transaction',
        to: user.email,
        first_name: user.first_name,
        transaction_type: 'MONTHLY_ALLOCATION',
        amount: tokens,
        balance_after: result.balance,
        notes: `Monthly allocation of ${tokens} tokens`,
      }).catch(() => undefined);
    }

    return { balance: result.balance };
  }

  /** Expire tokens based on FIFO rules and setting value */
  async expireTokens(practitionerId: string, expiryMonths: number): Promise<number> {
    return withTransaction(async (client) => {
      // 1. Get old credits
      const oldCreditsRes = await client.query<{ old_credits: number }>(
        `SELECT COALESCE(SUM(amount), 0)::int AS old_credits
         FROM token_transactions
         WHERE practitioner_id = $1
           AND (
             transaction_type IN ('PURCHASE', 'MONTHLY_ALLOCATION', 'REFUND')
             OR (transaction_type = 'ADJUSTMENT' AND amount > 0)
           )
           AND created_at < NOW() - INTERVAL '1 month' * $2`,
        [practitionerId, expiryMonths]
      );
      const oldCredits = oldCreditsRes.rows[0].old_credits;

      // 2. Get total debits
      const totalDebitsRes = await client.query<{ total_debits: number }>(
        `SELECT COALESCE(SUM(ABS(amount)), 0)::int AS total_debits
         FROM token_transactions
         WHERE practitioner_id = $1
           AND (
             transaction_type IN ('REFERRAL_CLAIM', 'EXPIRY')
             OR (transaction_type = 'ADJUSTMENT' AND amount < 0)
           )`,
        [practitionerId]
      );
      const totalDebits = totalDebitsRes.rows[0].total_debits;

      const pendingExpiry = Number(oldCredits) - Number(totalDebits);
      if (pendingExpiry <= 0) return 0;

      // 3. Update wallet balance and total_expired
      let [wallet] = await client.query<TokenWalletRow>(
        `SELECT * FROM token_wallets WHERE practitioner_id = $1 FOR UPDATE`,
        [practitionerId],
      ).then(r => r.rows);

      if (!wallet) return 0;

      const expiryAmount = Math.min(pendingExpiry, wallet.balance);
      if (expiryAmount <= 0) return 0;

      const newBalance = wallet.balance - expiryAmount;
      const totalExpired = wallet.total_expired + expiryAmount;

      await client.query(
        `UPDATE token_wallets
         SET balance = $1, total_expired = $2, updated_at = NOW()
         WHERE id = $3`,
        [newBalance, totalExpired, wallet.id],
      );

      // 4. Record EXPIRY transaction
      await client.query(
        `INSERT INTO token_transactions
           (wallet_id, practitioner_id, transaction_type, amount, balance_after, notes)
         VALUES ($1, $2, 'EXPIRY', $3, $4, $5)`,
        [
          wallet.id,
          practitionerId,
          -expiryAmount,
          newBalance,
          `Tokens expired after ${expiryMonths} months`,
        ],
      );

      return expiryAmount;
    });
  }
}

