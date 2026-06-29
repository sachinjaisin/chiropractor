import 'dotenv/config';
import nodemailer from 'nodemailer';
import { env } from '../src/config/env';

async function testEmail() {
  console.log('Testing SMTP connection with settings:');
  console.log('Host:', env.SMTP_HOST);
  console.log('Port:', env.SMTP_PORT);
  console.log('Secure:', env.SMTP_SECURE);
  console.log('User:', env.SMTP_USER);
  console.log('Pass:', env.SMTP_PASS ? '********' : 'undefined');
  console.log('From Name:', env.SMTP_FROM_NAME);
  console.log('From Email:', env.SMTP_FROM_EMAIL);

  if (!env.SMTP_HOST) {
    console.error('SMTP_HOST is not configured!');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER && env.SMTP_PASS ? {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    } : undefined,
  });

  try {
    console.log('Verifying connection...');
    await transporter.verify();
    console.log('Transporter connection verified successfully!');

    console.log('Sending test email to sachinjai088@gmail.com...');
    const info = await transporter.sendMail({
      from: `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`,
      to: 'sachinjai088@gmail.com',
      subject: 'ChiroReferral SMTP Test Email',
      text: 'This is a test email from the ChiroReferral diagnostic script.',
      html: '<p>This is a test email from the ChiroReferral diagnostic script.</p>',
    });
    console.log('Email sent successfully! Info:', info);
  } catch (error) {
    console.error('Failed to send email:', error);
  }
}

testEmail();
