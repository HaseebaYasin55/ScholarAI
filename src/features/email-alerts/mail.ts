import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendApplicationEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
})  {
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not configured. Email not sent.');
    return { success: false, error: 'API Key missing' };
  }

  try {
    const data = await resend.emails.send({
      from: 'ScholarAI <notifications@scholarai.app>',
      to: [to],
      subject: subject,
      html: html,
    });

    return { success: true, data };
  } catch (error) {
    console.error('Resend Error:', error);
    return { success: false, error };
  }
}

// Helper to generate branded email templates
export const EmailTemplates = {
  DeadlineAlert: (title: string, date: string, urgency: string) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
      <h2 style="color: #4f46e5; margin-bottom: 16px;">📅 Deadline Alert</h2>
      <p style="color: #374151; font-size: 16px; line-height: 1.5;">
        Your deadline for <strong>${title}</strong> is approaching!
      </p>
      <div style="background: #f9fafb; padding: 16px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #4f46e5;">
        <p style="margin: 0; font-weight: bold; color: #111827;">Date: ${date}</p>
        <p style="margin: 0; font-size: 14px; color: #6b7280;">Urgency: ${urgency}</p>
      </div>
      <a href="https://scholarai.app/dashboard" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Open Dashboard</a>
    </div>
  `,
  DocumentReminder: (docName: string, university: string) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
      <h2 style="color: #ef4444; margin-bottom: 16px;">📄 Missing Document</h2>
      <p style="color: #374151; font-size: 16px; line-height: 1.5;">
        You have a missing document for <strong>${university}</strong>:
      </p>
      <div style="background: #fef2f2; padding: 16px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #ef4444;">
        <p style="margin: 0; font-weight: bold; color: #991b1b;">Document: ${docName}</p>
      </div>
      <a href="https://scholarai.app/profile" style="display: inline-block; background: #ef4444; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Manage Documents</a>
    </div>
  `,
  ProfileReminder: () => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
      <h2 style="color: #4f46e5; margin-bottom: 16px;">✨ Complete Your Profile</h2>
      <p style="color: #374151; font-size: 16px; line-height: 1.5;">
        Your ScholarAI profile is incomplete. Completing it will help us find more tailored opportunities for you.
      </p>
      <a href="https://scholarai.app/profile" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Update Profile</a>
    </div>
  `
};
