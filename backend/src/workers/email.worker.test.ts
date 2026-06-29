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
    SMTP_FROM_EMAIL: 'no-reply@chiroreferral.com',
    SMTP_FROM_NAME: 'ChiroReferral',
    SENDGRID_API_KEY: 'SG.mock',
    SENDGRID_FROM_EMAIL: 'no-reply@chiroreferral.com',
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

jest.mock('../config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

jest.mock('../config/redis', () => ({
  getQueueRedisOptions: jest.fn(),
}));

import { executeEmailJob } from './email.worker';

describe('email.worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    expect(mailOptions.from).toBe('"ChiroReferral" <no-reply@chiroreferral.com>');
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
    expect(mailOptions.from).toBe('"ChiroReferral" <no-reply@chiroreferral.com>');
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
    expect(mailOptions.from).toBe('"ChiroReferral" <no-reply@chiroreferral.com>');
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
