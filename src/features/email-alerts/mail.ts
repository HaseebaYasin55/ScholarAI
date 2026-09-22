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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Helper to generate branded email templates
export const EmailTemplates = {
  DeadlineReminder: (payload: {
    scholarship: string;
    program: string;
    deadline: string;
    daysLeft: number;
    progress: number;
    missingItems: string[];
    applicationUrl: string;
  }) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 16px; padding: 24px;">
      <h2 style="color: #4f46e5; margin-bottom: 8px;">⏰ ${payload.daysLeft} ${payload.daysLeft === 1 ? "day" : "days"} left</h2>
      <p style="color: #374151; font-size: 16px; line-height: 1.5; margin-bottom: 16px;">
        The deadline for <strong>${escapeHtml(payload.scholarship)}</strong> is
        <strong>${escapeHtml(payload.program)}</strong> on
        <strong>${escapeHtml(payload.deadline)}</strong>.
      </p>
      <div style="background: #f9fafb; padding: 16px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #4f46e5;">
        <p style="margin: 0; font-size: 13px; color: #6b7280;">Application readiness</p>
        <p style="margin: 4px 0 0; font-weight: bold; color: #111827;">${payload.progress}% complete</p>
        <div style="margin-top: 8px; background: #e5e7eb; border-radius: 999px; height: 8px;">
          <div style="width: ${Math.max(0, Math.min(100, payload.progress))}%; background: #4f46e5; border-radius: 999px; height: 8px;"></div>
        </div>
      </div>
      ${
        payload.missingItems.length > 0
          ? `<div style="background: #fef2f2; padding: 16px; border-radius: 12px; margin: 16px 0; border-left: 4px solid #ef4444;">
              <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">Still missing for this application</p>
              <ul style="margin: 0; padding-left: 18px; color: #991b1b; font-size: 14px;">
                ${payload.missingItems.map((item) => `<li style="margin: 4px 0;">${escapeHtml(item)}</li>`).join("")}
              </ul>
            </div>`
          : ""
      }
      <a href="${payload.applicationUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Open Application</a>
    </div>
  `,
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
