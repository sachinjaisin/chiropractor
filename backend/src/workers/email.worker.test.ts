import 'dotenv/config';

// Mock config/env before importing email.worker
jest.mock('../config/env', () => ({
  env: {
    NODE_ENV: 'test',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 587,
    SMTP_SECURE: false,
    SMTP_USER: 'user',
    SMTP_PASS: 'pass',
    SMTP_FROM_EMAIL: 'no-reply@vitalitygroup.com.au',
    SMTP_FROM_NAME: 'ChiroReferral',
    SENDGRID_API_KEY: 'SG.mock',
    SENDGRID_FROM_EMAIL: 'no-reply@vitalitygroup.com.au',
    SENDGRID_FROM_NAME: 'ChiroReferral',
    APP_URL: 'http://localhost:3000',
  },
}));

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue([{ statusCode: 202 }]),
}));

const mockSendMail = jest.fn().mockResolvedValue({ messageId: '123' });
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: mockSendMail,
  }),
}));

const mockQuery = jest.fn();
const mockQueryOne = jest.fn();
jest.mock('../config/database', () => ({
  query: (...args: any[]) => mockQuery(...args),
  queryOne: (...args: any[]) => mockQueryOne(...args),
}));

jest.mock('../config/redis', () => ({
  getQueueRedisOptions: jest.fn(),
}));

import { executeEmailJob } from './email.worker';
import { escapeHtml } from '../utils/html';

describe('email.worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('HTML Escaping Utility', () => {
    it('should correctly escape special HTML characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(escapeHtml("Jane & John's <App>")).toBe('Jane &amp; John&#39;s &lt;App&gt;');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });
  });

  describe('Outbound Email HTML Escaping Remediation', () => {
    it('should escape user-controlled values in contact enquiry email', async () => {
      const jobData = {
        name: 'John <script>alert(1)</script>',
        email: 'john@example.com',
        phone: '123-456-7890',
        message: 'Hello <img src=x onerror=alert(2)> World',
      };

      await executeEmailJob('send-contact-enquiry', jobData);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];

      expect(mailOptions.html).not.toContain('<script>');
      expect(mailOptions.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(mailOptions.html).not.toContain('<img src=x');
      expect(mailOptions.html).toContain('&lt;img src=x onerror=alert(2)&gt;');
    });

    it('should escape user-controlled values in practitioner compliance alert', async () => {
      mockQueryOne.mockResolvedValueOnce({
        first_name: 'Evil<script>',
        last_name: 'Practitioner',
        email: 'evil@example.com',
      });
      mockQuery.mockResolvedValueOnce([{ email: 'admin@vitalitygroup.com.au' }]);

      await executeEmailJob('notify-admin-compliance-alert', {
        practitioner_id: 'p1',
        reason: 'Violated TOS <iframe src="javascript:alert(1)">',
        warning_count: 2,
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];

      expect(mailOptions.html).not.toContain('<script>');
      expect(mailOptions.html).toContain('Evil&lt;script&gt;');
      expect(mailOptions.html).not.toContain('<iframe');
      expect(mailOptions.html).toContain('&lt;iframe src=&quot;javascript:alert(1)&quot;&gt;');
    });

    it('should escape user-controlled values in request practitioner info email', async () => {
      mockQueryOne.mockResolvedValueOnce({
        email: 'chiro@example.com',
        first_name: 'Dr. <script>alert("name")</script>',
      });

      await executeEmailJob('request-practitioner-info', {
        practitioner_id: 'p1',
        message: 'Please re-upload license <svg/onload=alert(1)>',
      });

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];

      expect(mailOptions.html).not.toContain('<script>');
      expect(mailOptions.html).toContain('Dr. &lt;script&gt;');
      expect(mailOptions.html).not.toContain('<svg');
      expect(mailOptions.html).toContain('&lt;svg/onload=alert(1)&gt;');
    });
  });

  it('should send thank you email to patient after filling referral form', async () => {
    const jobData = {
      email: 'patient@example.com',
      first_name: 'Jane',
      referral_number: 'REF-2026-000001',
    };

    await executeEmailJob('send-patient-referral-thank-you', jobData);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailOptions = mockSendMail.mock.calls[0][0];

    expect(mailOptions.to).toBe('patient@example.com');
    expect(mailOptions.subject).toBe('Referral Request Received — ChiroReferral');
    expect(mailOptions.from).toBe('"ChiroReferral" <no-reply@vitalitygroup.com.au>');
    expect(mailOptions.html).toContain('REF-2026-000001');
    expect(mailOptions.html).toContain('Hi Jane,');
    expect(mailOptions.html).toContain('Thank you for submitting your referral request to ChiroReferral');
  });

  it('should send welcome email to practitioner after registration', async () => {
    const jobData = {
      to: 'chiro@example.com',
      first_name: 'Dr. John',
    };

    await executeEmailJob('send-welcome', jobData);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailOptions = mockSendMail.mock.calls[0][0];

    expect(mailOptions.to).toBe('chiro@example.com');
    expect(mailOptions.subject).toBe('Welcome to ChiroReferral — Complete Your Profile');
    expect(mailOptions.from).toBe('"ChiroReferral" <no-reply@vitalitygroup.com.au>');
    expect(mailOptions.html).toContain('Hi Dr. John,');
    expect(mailOptions.html).toContain('Thank you for registering with ChiroReferral!');
    expect(mailOptions.html).toContain('/dashboard');
  });

  it('should send password reset success email to user', async () => {
    const jobData = {
      to: 'user@example.com',
      first_name: 'Alice',
    };

    await executeEmailJob('send-password-reset-success', jobData);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailOptions = mockSendMail.mock.calls[0][0];

    expect(mailOptions.to).toBe('user@example.com');
    expect(mailOptions.subject).toBe('Your Password Has Been Reset — ChiroReferral');
    expect(mailOptions.from).toBe('"ChiroReferral" <no-reply@vitalitygroup.com.au>');
    expect(mailOptions.html).toContain('Hi Alice,');
    expect(mailOptions.html).toContain('This email confirms that the password for your ChiroReferral account was recently changed.');
  });

  it('should send subscription activated email to practitioner', async () => {
    const jobData = {
      to: 'chiro@example.com',
      first_name: 'Dr. John',
      plan_name: 'Premium Growth',
      included_tokens: 50,
    };

    await executeEmailJob('send-subscription-activated', jobData);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailOptions = mockSendMail.mock.calls[0][0];

    expect(mailOptions.to).toBe('chiro@example.com');
    expect(mailOptions.subject).toBe('Your Subscription is Active — ChiroReferral');
    expect(mailOptions.html).toContain('Dr. John');
    expect(mailOptions.html).toContain('Premium Growth');
    expect(mailOptions.html).toContain('50 tokens');
  });

  it('should send subscription cancelled email to practitioner', async () => {
    const jobData = {
      to: 'chiro@example.com',
      first_name: 'Dr. John',
      plan_name: 'Basic Starter',
    };

    await executeEmailJob('send-subscription-cancelled', jobData);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailOptions = mockSendMail.mock.calls[0][0];

    expect(mailOptions.to).toBe('chiro@example.com');
    expect(mailOptions.subject).toBe('Subscription Cancellation Request Received — ChiroReferral');
    expect(mailOptions.html).toContain('Dr. John');
    expect(mailOptions.html).toContain('Basic Starter');
    expect(mailOptions.html).toContain('remain active');
  });

  it('should send token transaction email to practitioner', async () => {
    const jobData = {
      to: 'chiro@example.com',
      first_name: 'Dr. John',
      transaction_type: 'PURCHASE',
      amount: 15,
      balance_after: 25,
      notes: 'Purchased 15 tokens package',
    };

    await executeEmailJob('send-token-transaction', jobData);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailOptions = mockSendMail.mock.calls[0][0];

    expect(mailOptions.to).toBe('chiro@example.com');
    expect(mailOptions.subject).toBe('Token Transaction Confirmation — ChiroReferral');
    expect(mailOptions.html).toContain('Dr. John');
    expect(mailOptions.html).toContain('+15 tokens');
    expect(mailOptions.html).toContain('25 tokens');
    expect(mailOptions.html).toContain('Purchased 15 tokens package');
  });

  it('should send profile completed email to practitioner', async () => {
    const jobData = {
      to: 'chiro@example.com',
      first_name: 'Dr. John',
    };

    await executeEmailJob('send-profile-completed', jobData);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailOptions = mockSendMail.mock.calls[0][0];

    expect(mailOptions.to).toBe('chiro@example.com');
    expect(mailOptions.subject).toBe('Profile Completed — Upload Documents to Complete Application');
    expect(mailOptions.html).toContain('Hi Dr. John,');
    expect(mailOptions.html).toContain('Congratulations on completing your practitioner profile details!');
    expect(mailOptions.html).toContain('upload your required documents');
    expect(mailOptions.html).toContain('/dashboard');
  });
});
