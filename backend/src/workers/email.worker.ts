import { Worker, Job } from 'bullmq';
import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import { getQueueRedisOptions } from '../config/redis';
import { query, queryOne } from '../config/database';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { generateFeedbackToken } from '../utils/crypto';

sgMail.setApiKey(env.SENDGRID_API_KEY);

let smtpTransporter: nodemailer.Transporter | null = null;

if (env.SMTP_HOST) {
  const auth = env.SMTP_USER && env.SMTP_PASS ? {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  } : undefined;

  smtpTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth,
  });
  logger.info({ host: env.SMTP_HOST, port: env.SMTP_PORT }, 'SMTP email transport configured');
}

type EmailJobData =
  | { type?: 'send-new-referral-available'; user_id: string; practitioner_id: string; referral_id: string }
  | { type?: 'send-password-reset'; to: string; token: string }
  | { type?: 'send-approval-status'; practitioner_id: string; status: string; reason?: string }
  | { type?: 'send-referral-claimed'; practitioner_id: string; referral_id: string }
  | { type?: 'send-feedback-request'; referral_id: string; patient_id: string; practitioner_id: string }
  | { type?: 'send-subscription-alert'; practitioner_id: string; alert_type: string }
  | { type?: 'notify-admin-new-application'; practitioner_id: string }
  | { type?: 'send-unclaimed-referral-alert'; admin_email: string; referral_id: string }
  | { type?: 'notify-admin-compliance-alert'; practitioner_id: string; reason: string; warning_count: number }
  | { type?: 'request-practitioner-info'; practitioner_id: string; message: string }
  | { type?: 'send-user-action'; user_id: string; action: string; changed_fields?: string[]; reason?: string }
  | { type?: 'send-contact-enquiry'; name: string; email: string; phone?: string; message: string }
  | { type?: 'send-patient-referral-thank-you'; email: string; first_name: string; referral_number: string }
  | { type?: 'send-welcome'; to: string; first_name: string }
  | { type?: 'send-password-reset-success'; to: string; first_name: string }
  | { type?: 'send-subscription-activated'; to: string; first_name: string; plan_name: string; included_tokens: number }
  | { type?: 'send-token-transaction'; to: string; first_name: string; transaction_type: string; amount: number; balance_after: number; notes: string }
  | { type?: 'send-profile-completed'; to: string; first_name: string };

function wrapEmailTemplate(salutation: string | null | undefined, bodyContentHtml: string): string {
  const isDev = env.NODE_ENV === 'development';
  const frontendUrl = isDev ? 'http://localhost:5173' : env.APP_URL;

  const logoUrl = `${frontendUrl}/assets/images/logo.png`;
  const bgUrl = `${frontendUrl}/assets/images/bg.png`;

  const salutationHeader = salutation
    ? `<h3 style="margin: 0px 0px 15px 0px;font-weight: 600;font-size: 26px;color: #1f244a;font-family: 'Montserrat', sans-serif;">Hi ${salutation},</h3>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <title>ChiroReferral</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style type="text/css">
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap');
    body {
        font-family: 'Montserrat', sans-serif;
        margin: 0px;
        background: #fff;
    }
  </style>
</head>
<body style="font-family: 'Montserrat', sans-serif; margin: 0px; background: #fff;">
<div class="mail-messages-body-top" style="width: 640px; margin: 50px auto; font-family: 'Montserrat', sans-serif;">
  <div class="mail-messages-body" style="padding: 20px; background: #eaeaea; border-radius: 8px;">
    <div class="mail-messages" style="background: #FFFFFF; padding: 30px; border-radius: 8px 8px 0 0;">
      <div class="mail-logo" style="margin-bottom: 20px; text-align: center;">
        <a href="#" style="display: block; width: 160px; margin: 0px auto;">
          <img src="${logoUrl}" class="img-fluid" alt="ChiroReferral Logo" style="max-width: 100%; height: auto; display: block; margin: 0 auto;">
        </a>
      </div>
      <div class="bgimg" style="margin-bottom: 20px;">
        <img src="${bgUrl}" class="img-fluid" alt="Background Banner" style="max-width: 100%; height: auto; width: 100%; display: block; border-radius: 6px;">
      </div>
      <div class="namemail" style="font-family: 'Montserrat', sans-serif; color: #000000; line-height: 1.6;">
        ${salutationHeader}
        ${bodyContentHtml}
      </div> 
    </div>
    <div class="mail-messages-bottom" style="padding: 30px; background: #fbfbfb; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
      <div class="footer" style="font-family: 'Montserrat', sans-serif;">
        <h3 style="margin: 0px 0px 7px 0px; font-size: 14px; font-weight: 600; color: #1f244a;">Regards</h3>
        <p style="font-size: 14px; margin: 0px; color: #4b5563;">- The ChiroReferral Team</p>
      </div> 
    </div>
  </div>
</div>
</body>
</html>`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (smtpTransporter) {
    await smtpTransporter.sendMail({
      from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
      to,
      subject,
      html,
    });
    logger.debug({ to, subject }, 'Email sent via SMTP');
  } else {
    await sgMail.send({
      to,
      from: { email: env.SENDGRID_FROM_EMAIL, name: env.SENDGRID_FROM_NAME },
      subject,
      html,
    });
    logger.debug({ to, subject }, 'Email sent via SendGrid');
  }
}

async function handleNewReferralAvailable(data: { user_id: string; referral_id: string }) {
  const user = await queryOne<{ email: string; first_name: string }>(
    'SELECT email, first_name FROM users WHERE id = $1',
    [data.user_id],
  );
  if (!user) return;

  const bodyContent = `
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">A new referral opportunity matching your service area is now available on ChiroReferral.</p>
    <p style="margin: 20px 0;"><a href="${env.APP_URL}/referrals/available/${data.referral_id}" style="background:#0068b9;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;box-shadow:0 2px 4px rgba(0,104,185,0.2);font-family: 'Montserrat', sans-serif;">View Referral</a></p>
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Log in to review the details and claim the referral before another chiropractor does.</p>
  `;

  await sendEmail(
    user.email,
    'New Referral Available — ChiroReferral',
    wrapEmailTemplate(user.first_name, bodyContent),
  );
}

async function handlePasswordReset(data: { to: string; token: string }) {
  const resetUrl = `${env.APP_URL}/reset-password?token=${data.token}`;
  
  const user = await queryOne<{ first_name: string }>(
    'SELECT first_name FROM users WHERE email = $1',
    [data.to],
  );
  const salutation = user ? user.first_name : 'there';

  const bodyContent = `
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">We received a request to reset your ChiroReferral account password.</p>
    <p style="margin: 20px 0;"><a href="${resetUrl}" style="background:#0068b9;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;box-shadow:0 2px 4px rgba(0,104,185,0.2);font-family: 'Montserrat', sans-serif;">Reset Password</a></p>
    <p style="font-size: 12px; margin: 20px 0px 0px 0px; color: #6b7280; font-family: 'Montserrat', sans-serif;">This link expires in 1 hour. If you did not request this, please ignore this email.</p>
  `;

  await sendEmail(
    data.to,
    'Reset Your ChiroReferral Password',
    wrapEmailTemplate(salutation, bodyContent),
  );
}

async function handleApprovalStatus(data: { practitioner_id: string; status: string; reason?: string }) {
  const user = await queryOne<{ email: string; first_name: string }>(
    `SELECT u.email, u.first_name FROM users u JOIN practitioners p ON p.user_id = u.id WHERE p.id = $1`,
    [data.practitioner_id],
  );
  if (!user) return;

  let bodyContent = '';
  let subject = '';

  if (data.status === 'APPROVED') {
    subject = 'Your Application Has Been Approved — ChiroReferral';
    bodyContent = `
      <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Your ChiroReferral application has been <strong>approved</strong>. You can now subscribe to a plan and start receiving referrals.</p>
      <p style="margin: 20px 0;"><a href="${env.APP_URL}/dashboard" style="background:#16a34a;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;box-shadow:0 2px 4px rgba(22,163,74,0.2);font-family: 'Montserrat', sans-serif;">Go to Dashboard</a></p>
    `;
  } else if (data.status === 'REJECTED') {
    subject = 'ChiroReferral Application Update';
    bodyContent = `
      <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">After reviewing your application, we are unable to approve your account at this time.</p>
      ${data.reason ? `<p style="font-size: 14px; margin: 12px 0px; color: #dc2626; font-family: 'Montserrat', sans-serif;"><strong>Reason:</strong> ${data.reason}</p>` : ''}
      <p style="font-size: 14px; margin: 12px 0px 0px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Please contact support if you have questions.</p>
    `;
  } else if (data.status === 'PENDING_APPROVAL') {
    subject = 'Your Application is Under Review — ChiroReferral';
    bodyContent = `
      <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Thank you for submitting your application to ChiroReferral.</p>
      <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">We have received your professional license and insurance documents and are currently reviewing them.</p>
      <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">We will notify you by email as soon as your account status is updated.</p>
    `;
  }

  if (subject && bodyContent) {
    await sendEmail(
      user.email,
      subject,
      wrapEmailTemplate(user.first_name, bodyContent),
    );
  }
}

async function handleFeedbackRequest(data: {
  referral_id:     string;
  patient_id:      string;
  practitioner_id: string;
}) {
  const patient = await queryOne<{ email: string | null; first_name: string }>(
    'SELECT email, first_name FROM patients WHERE id = $1',
    [data.patient_id],
  );
  if (!patient?.email) return;

  const token      = generateFeedbackToken(data.referral_id, data.patient_id);
  const feedbackUrl = `${env.APP_URL}/feedback/${data.referral_id}?token=${token}`;

  const bodyContent = `
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">We hope your chiropractic appointment went well! Please take a moment to share your experience.</p>
    <p style="margin: 20px 0;"><a href="${feedbackUrl}" style="background:#0068b9;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;box-shadow:0 2px 4px rgba(0,104,185,0.2);font-family: 'Montserrat', sans-serif;">Leave Feedback</a></p>
    <p style="font-size: 14px; margin: 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Your feedback helps other patients find great care. Thank you!</p>
  `;

  await sendEmail(
    patient.email,
    'How was your chiropractic appointment? — ChiroReferral',
    wrapEmailTemplate(patient.first_name, bodyContent),
  );
}

async function handleSubscriptionAlert(data: { practitioner_id: string; alert_type: string }) {
  const user = await queryOne<{ email: string; first_name: string }>(
    `SELECT u.email, u.first_name FROM users u JOIN practitioners p ON p.user_id = u.id WHERE p.id = $1`,
    [data.practitioner_id],
  );
  if (!user) return;

  const messages: Record<string, { subject: string; body: string }> = {
    PAST_DUE: {
      subject: 'Payment Failed — ChiroReferral',
      body: `<p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Your subscription payment failed. Please update your payment method to continue receiving referrals.</p>`,
    },
    TOKENS_LOW: {
      subject: 'Token Balance Low — ChiroReferral',
      body: `<p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Your token balance is running low. Purchase more tokens to continue claiming referrals.</p>`,
    },
  };

  const msg = messages[data.alert_type];
  if (!msg) return;

  await sendEmail(
    user.email,
    msg.subject,
    wrapEmailTemplate(user.first_name, msg.body),
  );
}

async function handleReferralClaimed(data: { practitioner_id: string; referral_id: string }) {
  const user = await queryOne<{ email: string; first_name: string }>(
    `SELECT u.email, u.first_name FROM users u JOIN practitioners p ON p.user_id = u.id WHERE p.id = $1`,
    [data.practitioner_id],
  );
  if (!user) return;

  const referral = await queryOne<{ referral_number: string; primary_complaint: string; patient_id: string }>(
    `SELECT referral_number, primary_complaint, patient_id FROM referrals WHERE id = $1`,
    [data.referral_id],
  );
  if (!referral) return;

  const patient = await queryOne<{ first_name: string; last_name: string; email: string; phone: string }>(
    `SELECT first_name, last_name, email, phone FROM patients WHERE id = $1`,
    [referral.patient_id],
  );

  const patientDetails = patient ? `
    <div style="margin: 20px 0; padding: 15px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px;">
      <h4 style="margin: 0 0 10px 0; font-size: 16px; color: #1f244a;">Patient Contact Information</h4>
      <p style="font-size: 14px; margin: 5px 0;"><strong>Name:</strong> ${patient.first_name} ${patient.last_name}</p>
      <p style="font-size: 14px; margin: 5px 0;"><strong>Email:</strong> ${patient.email}</p>
      <p style="font-size: 14px; margin: 5px 0;"><strong>Phone:</strong> ${patient.phone}</p>
    </div>
  ` : '';

  const bodyContent = `
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">You have successfully claimed referral <strong>${referral.referral_number}</strong>.</p>
    <p style="font-size: 14px; margin: 12px 0px; color: #1f244a; padding: 12px; background: #f3f4f6; border-radius: 6px; font-family: 'Montserrat', sans-serif;"><strong>Primary Complaint:</strong> ${referral.primary_complaint}</p>
    ${patientDetails}
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Please log in to your dashboard to view full case notes and manage your referral.</p>
    <p style="margin: 20px 0;"><a href="${env.APP_URL}/dashboard" style="background:#0068b9;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;box-shadow:0 2px 4px rgba(0,104,185,0.2);font-family: 'Montserrat', sans-serif;">Go to Dashboard</a></p>
  `;

  await sendEmail(
    user.email,
    `Referral Claimed - ${referral.referral_number} — ChiroReferral`,
    wrapEmailTemplate(user.first_name, bodyContent),
  );
}

async function handleNotifyAdminNewApplication(data: { practitioner_id: string }) {
  const practitioner = await queryOne<{ first_name: string; last_name: string; email: string; practice_name: string | null }>(
    `SELECT u.first_name, u.last_name, u.email, pp.practice_name
     FROM practitioners p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN practitioner_profiles pp ON pp.practitioner_id = p.id
     WHERE p.id = $1`,
    [data.practitioner_id],
  );
  if (!practitioner) return;

  const admins = await query<{ email: string }>(
    "SELECT email FROM users WHERE role = 'admin' AND is_active = TRUE"
  );
  if (admins.length === 0) return;

  const subject = 'New Chiropractor Application Pending Approval — ChiroReferral';
  const bodyContent = `
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">A new chiropractor has completed their profile and uploaded credentials:</p>
    <ul style="font-size: 14px; color: #374151; margin: 12px 0; padding-left: 20px; line-height: 1.8; font-family: 'Montserrat', sans-serif;">
      <li><strong>Name:</strong> ${practitioner.first_name} ${practitioner.last_name}</li>
      <li><strong>Email:</strong> ${practitioner.email}</li>
      <li><strong>Practice Name:</strong> ${practitioner.practice_name ?? '—'}</li>
    </ul>
    <p style="margin: 20px 0;"><a href="${env.APP_URL}/admin" style="background:#0068b9;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;box-shadow:0 2px 4px rgba(0,104,185,0.2);font-family: 'Montserrat', sans-serif;">Review Application</a></p>
  `;

  await Promise.all(
    admins.map(admin =>
      sendEmail(
        admin.email,
        subject,
        wrapEmailTemplate('Admin', bodyContent),
      )
    )
  );
}

async function handleSendUnclaimedReferralAlert(data: { admin_email: string; referral_id: string }) {
  const referral = await queryOne<{ referral_number: string; primary_complaint: string }>(
    'SELECT referral_number, primary_complaint FROM referrals WHERE id = $1',
    [data.referral_id],
  );
  if (!referral) return;

  const bodyContent = `
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Referral <strong>${referral.referral_number}</strong> has expired without being claimed by any chiropractor.</p>
    <p style="font-size: 14px; margin: 12px 0px; color: #1f244a; padding: 12px; background: #f3f4f6; border-radius: 6px; font-family: 'Montserrat', sans-serif;"><strong>Primary Complaint:</strong> ${referral.primary_complaint}</p>
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">You can reassign this referral, extend its visibility, or close it from the admin console.</p>
    <p style="margin: 20px 0;"><a href="${env.APP_URL}/admin" style="background:#0068b9;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;box-shadow:0 2px 4px rgba(0,104,185,0.2);font-family: 'Montserrat', sans-serif;">Manage Referral</a></p>
  `;

  await sendEmail(
    data.admin_email,
    `Referral Unclaimed & Expired: ${referral.referral_number} — ChiroReferral`,
    wrapEmailTemplate('Admin', bodyContent),
  );
}

async function handleNotifyAdminComplianceAlert(data: { practitioner_id: string; reason: string; warning_count: number }) {
  const practitioner = await queryOne<{ first_name: string; last_name: string; email: string }>(
    `SELECT u.first_name, u.last_name, u.email FROM practitioners p JOIN users u ON u.id = p.user_id WHERE p.id = $1`,
    [data.practitioner_id],
  );
  if (!practitioner) return;

  const admins = await query<{ email: string }>(
    "SELECT email FROM users WHERE role = 'admin' AND is_active = TRUE"
  );
  if (admins.length === 0) return;

  const subject = `Compliance Alert: Warning Issued to ${practitioner.first_name} ${practitioner.last_name}`;
  const bodyContent = `
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">A formal warning has been issued to chiropractor <strong>${practitioner.first_name} ${practitioner.last_name}</strong> (${practitioner.email}).</p>
    <div style="font-size: 14px; margin: 12px 0px; padding: 12px; background: #fdf2f2; border-left: 4px solid #f8b4b4; color: #9b1c1c; border-radius: 4px; font-family: 'Montserrat', sans-serif;">
      <p style="margin: 0 0 6px 0;"><strong>Reason:</strong> ${data.reason}</p>
      <p style="margin: 0;"><strong>Total Warning Count:</strong> ${data.warning_count}</p>
    </div>
    <p style="margin: 20px 0;"><a href="${env.APP_URL}/admin" style="background:#0068b9;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;box-shadow:0 2px 4px rgba(0,104,185,0.2);font-family: 'Montserrat', sans-serif;">View Chiropractor Details</a></p>
  `;

  await Promise.all(
    admins.map(admin =>
      sendEmail(
        admin.email,
        subject,
        wrapEmailTemplate('Admin', bodyContent),
      )
    )
  );
}

async function handleRequestPractitionerInfo(data: { practitioner_id: string; message: string }) {
  const user = await queryOne<{ email: string; first_name: string }>(
    `SELECT u.email, u.first_name FROM users u JOIN practitioners p ON p.user_id = u.id WHERE p.id = $1`,
    [data.practitioner_id],
  );
  if (!user) return;

  const bodyContent = `
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">An administrator reviewed your application and needs additional information or documentation before approving your account:</p>
    <blockquote style="background:#f3f4f6;border-left:4px solid #0068b9;padding:12px 15px;margin:15px 0;font-style:italic;color:#374151;border-radius: 4px;font-family: 'Montserrat', sans-serif;">
      ${data.message}
    </blockquote>
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Please log in to your dashboard and update your profile or documents accordingly.</p>
    <p style="margin: 20px 0;"><a href="${env.APP_URL}/dashboard" style="background:#0068b9;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;box-shadow:0 2px 4px rgba(0,104,185,0.2);font-family: 'Montserrat', sans-serif;">Go to Dashboard</a></p>
  `;

  await sendEmail(
    user.email,
    'Additional Information Required — ChiroReferral',
    wrapEmailTemplate(user.first_name, bodyContent),
  );
}

async function handleUserAction(data: { user_id: string; action: string; changed_fields?: string[]; reason?: string }) {
  const user = await queryOne<{ email: string; first_name: string }>(
    `SELECT email, first_name FROM users WHERE id = $1`,
    [data.user_id],
  );
  if (!user) return;

  let subject = '';
  let bodyContent = '';
  if (data.action === 'DISABLED') {
    subject = 'Your Account Has Been Disabled — ChiroReferral';
    bodyContent = `
      <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Your account has been disabled by an administrator. If you believe this is an error, please contact support.</p>
    `;
  } else if (data.action === 'SUSPENDED') {
    subject = 'Your Account Has Been Suspended — ChiroReferral';
    bodyContent = `
      <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Your account has been suspended by an administrator.</p>
      ${data.reason ? `<p style="font-size: 14px; margin: 12px 0px; color: #dc2626; font-family: 'Montserrat', sans-serif;"><strong>Reason:</strong> ${data.reason}</p>` : ''}
      <p style="font-size: 14px; margin: 12px 0px 0px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">If you believe this is an error, please contact support.</p>
    `;
  } else if (data.action === 'REACTIVATED') {
    subject = 'Your Account Has Been Reactivated — ChiroReferral';
    bodyContent = `
      <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Your account is now active again. You can log in and continue using the platform.</p>
    `;
  } else if (data.action === 'EDITED') {
    subject = 'Your Account Details Have Been Updated — ChiroReferral';
    const fields = data.changed_fields?.join(', ') ?? 'details';
    bodyContent = `
      <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">The following fields of your account have been updated by an administrator: <strong>${fields}</strong>.</p>
    `;
  }

  if (subject && bodyContent) {
    await sendEmail(
      user.email,
      subject,
      wrapEmailTemplate(user.first_name, bodyContent),
    );
  }
}

async function handleContactEnquiry(data: { name: string; email: string; phone?: string; message: string }) {
  const phoneRow = data.phone
    ? `<tr><td style="padding:6px 0;font-weight:600;color:#1f244a;width:80px;">Phone:</td><td style="padding:6px 0;">${data.phone}</td></tr>`
    : '';

  const bodyContent = `
    <p style="font-size:14px;margin:0px 0px 16px 0px;color:#374151;font-family:'Montserrat',sans-serif;">A new enquiry has been submitted via the ChiroReferral chiropractor panel.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;font-family:'Montserrat',sans-serif;">
      <tr><td style="padding:6px 0;font-weight:600;color:#1f244a;width:80px;">Name:</td><td style="padding:6px 0;">${data.name}</td></tr>
      <tr><td style="padding:6px 0;font-weight:600;color:#1f244a;">Email:</td><td style="padding:6px 0;">${data.email}</td></tr>
      ${phoneRow}
      <tr><td colspan="2" style="padding:12px 0 4px 0;font-weight:600;color:#1f244a;">Message:</td></tr>
      <tr><td colspan="2" style="padding:4px 0;color:#374151;">${data.message.replace(/\n/g, '<br>')}</td></tr>
    </table>
  `;

  await sendEmail(
    'Rev@welladjusted.co',
    `New Enquiry from ${data.name} — ChiroReferral`,
    wrapEmailTemplate(null, bodyContent),
  );
}

async function handlePatientReferralThankYou(data: { email: string; first_name: string; referral_number: string }) {
  const bodyContent = `
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Thank you for submitting your referral request to ChiroReferral. We have received your request, and our matching system is searching for the best chiropractor to meet your needs.</p>
    <p style="font-size: 14px; margin: 12px 0px; color: #1f244a; padding: 12px; background: #f3f4f6; border-radius: 6px; font-family: 'Montserrat', sans-serif;"><strong>Referral Reference Number:</strong> ${data.referral_number}</p>
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">A matching practitioner will review your case details and contact you to schedule an appointment. You can use your reference number if you need to contact support or track your request.</p>
  `;

  await sendEmail(
    data.email,
    'Referral Request Received — ChiroReferral',
    wrapEmailTemplate(data.first_name, bodyContent),
  );
}

async function handleWelcome(data: { to: string; first_name: string }) {
  const bodyContent = `
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Thank you for registering with ChiroReferral!</p>
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">To start receiving chiropractic referrals, please log in to your dashboard to complete your practitioner profile and upload your license and insurance documents for verification.</p>
    <p style="margin: 20px 0;"><a href="${env.APP_URL}/dashboard" style="background:#0068b9;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;box-shadow:0 2px 4px rgba(0,104,185,0.2);font-family: 'Montserrat', sans-serif;">Go to Dashboard</a></p>
  `;

  await sendEmail(
    data.to,
    'Welcome to ChiroReferral — Complete Your Profile',
    wrapEmailTemplate(data.first_name, bodyContent),
  );
}

async function handlePasswordResetSuccess(data: { to: string; first_name: string }) {
  const bodyContent = `
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">This email confirms that the password for your ChiroReferral account was recently changed.</p>
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">If you did not make this change, please contact our support team immediately.</p>
  `;

  await sendEmail(
    data.to,
    'Your Password Has Been Reset — ChiroReferral',
    wrapEmailTemplate(data.first_name, bodyContent),
  );
}

async function handleSubscriptionActivated(data: {
  to: string;
  first_name: string;
  plan_name: string;
  included_tokens: number;
}) {
  const bodyContent = `
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Your subscription to the <strong>${data.plan_name}</strong> plan is now active!</p>
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">We have allocated <strong>${data.included_tokens} tokens</strong> to your account, which you can use to claim referrals immediately.</p>
    <p style="margin: 20px 0;"><a href="${env.APP_URL}/dashboard" style="background:#0068b9;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;box-shadow:0 2px 4px rgba(0,104,185,0.2);font-family: 'Montserrat', sans-serif;">Go to Dashboard</a></p>
  `;

  await sendEmail(
    data.to,
    'Your Subscription is Active — ChiroReferral',
    wrapEmailTemplate(data.first_name, bodyContent),
  );
}

async function handleSubscriptionCancelled(data: {
  to: string;
  first_name: string;
  plan_name: string;
}) {
  const bodyContent = `
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">We have received your request to cancel your subscription to the <strong>${data.plan_name}</strong> plan.</p>
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Your subscription will remain active with access to matching referrals until the end of your current billing period.</p>
  `;

  await sendEmail(
    data.to,
    'Subscription Cancellation Request Received — ChiroReferral',
    wrapEmailTemplate(data.first_name, bodyContent),
  );
}

async function handleTokenTransaction(data: {
  to: string;
  first_name: string;
  transaction_type: string;
  amount: number;
  balance_after: number;
  notes: string;
}) {
  const amountSign = data.amount >= 0 ? `+${data.amount}` : `${data.amount}`;
  const typeFormatted = data.transaction_type.replace('_', ' ');

  const bodyContent = `
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">A new transaction has been posted to your ChiroReferral token wallet:</p>
    <table style="width:100%; border-collapse:collapse; font-size:14px; font-family:'Montserrat',sans-serif; margin: 20px 0; background: #f3f4f6; border-radius: 6px; overflow: hidden;">
      <tr>
        <td style="padding:12px; font-weight:600; color:#1f244a; border-bottom: 1px solid #e5e7eb; width: 140px;">Transaction Type:</td>
        <td style="padding:12px; border-bottom: 1px solid #e5e7eb; text-transform: capitalize;">${typeFormatted}</td>
      </tr>
      <tr>
        <td style="padding:12px; font-weight:600; color:#1f244a; border-bottom: 1px solid #e5e7eb;">Amount:</td>
        <td style="padding:12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: ${data.amount >= 0 ? '#16a34a' : '#dc2626'};">${amountSign} tokens</td>
      </tr>
      <tr>
        <td style="padding:12px; font-weight:600; color:#1f244a; border-bottom: 1px solid #e5e7eb;">New Balance:</td>
        <td style="padding:12px; border-bottom: 1px solid #e5e7eb;">${data.balance_after} tokens</td>
      </tr>
      <tr>
        <td style="padding:12px; font-weight:600; color:#1f244a;">Details:</td>
        <td style="padding:12px;">${data.notes}</td>
      </tr>
    </table>
  `;

  await sendEmail(
    data.to,
    'Token Transaction Confirmation — ChiroReferral',
    wrapEmailTemplate(data.first_name, bodyContent),
  );
}

async function handleProfileCompleted(data: { to: string; first_name: string }) {
  const bodyContent = `
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">Congratulations on completing your practitioner profile details!</p>
    <p style="font-size: 14px; margin: 0px 0px 12px 0px; color: #374151; font-family: 'Montserrat', sans-serif;">To complete your application and submit it for verification, please log in to your dashboard to upload your required documents (professional license and malpractice insurance).</p>
    <p style="margin: 20px 0;"><a href="${env.APP_URL}/dashboard" style="background:#0068b9;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block;box-shadow:0 2px 4px rgba(0,104,185,0.2);font-family: 'Montserrat', sans-serif;">Upload Documents</a></p>
  `;

  await sendEmail(
    data.to,
    'Profile Completed — Upload Documents to Complete Application',
    wrapEmailTemplate(data.first_name, bodyContent),
  );
}

export async function executeEmailJob(name: string, data: any): Promise<void> {
  switch (name) {
    case 'send-new-referral-available':
      await handleNewReferralAvailable(data as { user_id: string; referral_id: string });
      break;
    case 'send-password-reset':
      await handlePasswordReset(data as { to: string; token: string });
      break;
    case 'send-approval-status':
      await handleApprovalStatus(data as { practitioner_id: string; status: string; reason?: string });
      break;
    case 'send-referral-claimed':
      await handleReferralClaimed(data as { practitioner_id: string; referral_id: string });
      break;
    case 'send-feedback-request':
      await handleFeedbackRequest(data as { referral_id: string; patient_id: string; practitioner_id: string });
      break;
    case 'send-subscription-alert':
      await handleSubscriptionAlert(data as { practitioner_id: string; alert_type: string });
      break;
    case 'notify-admin-new-application':
      await handleNotifyAdminNewApplication(data as { practitioner_id: string });
      break;
    case 'send-unclaimed-referral-alert':
      await handleSendUnclaimedReferralAlert(data as { admin_email: string; referral_id: string });
      break;
    case 'notify-admin-compliance-alert':
      await handleNotifyAdminComplianceAlert(data as { practitioner_id: string; reason: string; warning_count: number });
      break;
    case 'request-practitioner-info':
      await handleRequestPractitionerInfo(data as { practitioner_id: string; message: string });
      break;
    case 'send-user-action':
      await handleUserAction(data as { user_id: string; action: string; changed_fields?: string[] });
      break;
    case 'send-contact-enquiry':
      await handleContactEnquiry(data as { name: string; email: string; phone?: string; message: string });
      break;
    case 'send-patient-referral-thank-you':
      await handlePatientReferralThankYou(data as { email: string; first_name: string; referral_number: string });
      break;
    case 'send-welcome':
      await handleWelcome(data as { to: string; first_name: string });
      break;
    case 'send-password-reset-success':
      await handlePasswordResetSuccess(data as { to: string; first_name: string });
      break;
    case 'send-subscription-activated':
      await handleSubscriptionActivated(data as { to: string; first_name: string; plan_name: string; included_tokens: number });
      break;
    case 'send-subscription-cancelled':
      await handleSubscriptionCancelled(data as { to: string; first_name: string; plan_name: string });
      break;
    case 'send-token-transaction':
      await handleTokenTransaction(data as { to: string; first_name: string; transaction_type: string; amount: number; balance_after: number; notes: string });
      break;
    case 'send-profile-completed':
      await handleProfileCompleted(data as { to: string; first_name: string });
      break;
    default:
      logger.warn({ job: name }, 'Unknown email job type');
  }
}

export function startEmailWorker() {
  const worker = new Worker<EmailJobData>('email', async (job: Job<EmailJobData>) => {
    logger.debug({ job: job.name, jobId: job.id }, 'Processing email job');
    await executeEmailJob(job.name, job.data);
  }, {
    connection: getQueueRedisOptions(),
    concurrency: 20,
    limiter: { max: 100, duration: 1000 },
  });

  worker.on('failed', (job, err) => {
    logger.error({ job: job?.name, jobId: job?.id, err }, 'Email worker job failed');
  });

  return worker;
}
