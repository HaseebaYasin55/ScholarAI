import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendApplicationEmail, EmailTemplates } from '@/features/email-alerts/mail';

export async function GET(request: Request) {
  // Security: In production, this should be protected by a secret key
  const { searchParams } = new URL(request.url);
  const cronSecret = searchParams.get('key');
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. Get all users with their profiles
    const { data: users, error: userError } = await supabase
      .from('profiles')
      .select('id, email');

    if (userError) throw userError;

    const results = {
      emailsSent: 0,
      errors: 0,
    };

    for (const user of users) {
      // Check Preferences
      const { data: prefs } = await supabase
        .from('email_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // Default to TRUE if no preferences set
      const allowDeadlines = prefs?.deadline_alerts ?? true;
      const allowDocuments = prefs?.document_alerts ?? true;
      const allowProfile = prefs?.profile_reminders ?? true;

      // --- TASK 1: DEADLINES ---
      if (allowDeadlines) {
        const { data: urgentDeadlines } = await supabase
          .from('deadlines')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'Upcoming')
          .lt('date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()); // Next 7 days

        for (const deadline of urgentDeadlines || []) {
          const isSent = await checkAlreadySent(user.id, deadline.id, 'deadline');
          if (!isSent) {
            const success = await sendApplicationEmail({
              to: user.email!,
              subject: `Upcoming Deadline: ${deadline.title}`,
              html: EmailTemplates.DeadlineAlert(deadline.title, deadline.date, deadline.urgency),
            });
            if (success.success) {
              await logSentEmail(user.id, deadline.id, 'deadline');
              results.emailsSent++;
            } else {
              results.errors++;
            }
          }
        }
      }

      // --- TASK 2: MISSING DOCUMENTS ---
      if (allowDocuments) {
        const { data: missingDocs } = await supabase
          .from('documents')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'Missing');

        for (const doc of missingDocs || []) {
          const isSent = await checkAlreadySent(user.id, doc.id, 'document');
          if (!isSent) {
            const success = await sendApplicationEmail({
              to: user.email!,
              subject: `Reminder: Missing Document for ${doc.university}`,
              html: EmailTemplates.DocumentReminder(doc.name, doc.university),
            });
            if (success.success) {
              await logSentEmail(user.id, doc.id, 'document');
              results.emailsSent++;
            } else {
              results.errors++;
            }
          }
        }
      }

      // --- TASK 3: PROFILE COMPLETION ---
      if (allowProfile) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('bio, phone, linkedin')
          .eq('id', user.id)
          .single();

        const isIncomplete = !profile?.bio || !profile?.linkedin;

        if (isIncomplete) {
          const isSent = await checkAlreadySent(user.id, null, 'profile');
          if (!isSent) {
            const success = await sendApplicationEmail({
              to: user.email!,
              subject: 'Complete Your ScholarAI Profile',
              html: EmailTemplates.ProfileReminder(),
            });
            if (success.success) {
              await logSentEmail(user.id, null, 'profile');
              results.emailsSent++;
            } else {
              results.errors++;
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cron Job Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

async function checkAlreadySent(userId: string, notificationId: string | null, type: string) {
  let query = supabase
    .from('sent_emails')
    .select('id')
    .eq('user_id', userId)
    .eq('type', type);

  if (notificationId) {
    query = query.eq('notification_id', notificationId);
  }

  const { data } = await query.maybeSingle();

  return !!data;
}

async function logSentEmail(userId: string, notificationId: string | null, type: string) {
  await supabase.from('sent_emails').insert({
    user_id: userId,
    notification_id: notificationId,
    type: type,
  });
}
