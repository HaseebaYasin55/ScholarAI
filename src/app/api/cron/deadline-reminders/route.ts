import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  EmailTemplates,
  sendApplicationEmail,
} from "@/features/email-alerts/mail";
import { daysUntil, formatLongDate } from "@/lib/scholarship/format";
import { computeApplicationReadiness } from "@/lib/scholarship/readiness";
import { isAppliedLikeStatus } from "@/features/application-tracking/status";
import type { Application } from "@/store/appStore";

// Vercel Cron runs this once daily; make sure the response is never cached.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Reminder cadence: exactly N days before the deadline. */
const MILESTONES: readonly number[] = [14, 7, 3, 1];

interface ReminderCandidate {
  userId: string;
  applicationId: string;
  email: string;
  scholarship: string;
  program: string;
  deadline: string;
  daysLeft: number;
  progress: number;
  missingItems: string[];
}

function reminderType(daysLeft: number): string {
  return `deadline_reminder:${daysLeft}`;
}

async function hasSentReminder(
  userId: string,
  applicationId: string,
  type: string,
): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("sent_emails")
    .select("id")
    .eq("user_id", userId)
    .eq("notification_id", applicationId)
    .eq("type", type)
    .maybeSingle();
  return Boolean(data);
}

async function logSentReminder(
  userId: string,
  applicationId: string,
  type: string,
): Promise<void> {
  await getSupabaseAdmin().from("sent_emails").insert({
    user_id: userId,
    notification_id: applicationId,
    type,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("key") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Local-only test affordance: `dryRun=1` plans reminders without sending or
  // logging. Disabled in production so a leaked URL can't probe recipients.
  const requestedDryRun = searchParams.get("dryRun") === "1";
  const dryRun = process.env.NODE_ENV !== "production" && requestedDryRun;

  // Local-only test affordance: restrict to one application so an end-to-end
  // test never emails real users. Ignored in production.
  const onlyApplication =
    process.env.NODE_ENV !== "production" ? searchParams.get("onlyApplication") : null;

  const supabaseAdmin = getSupabaseAdmin();

  const results = {
    success: true,
    mode: (dryRun ? "dry-run" : "live") as "dry-run" | "live",
    scanned: 0,
    candidates: 0,
    emailsSent: 0,
    errors: 0,
    alreadySent: 0,
    dryRunEmails: [] as ReminderCandidate[],
    timestamp: new Date().toISOString(),
  };

  try {
    const [{ data: profiles }, { data: applications }, { data: documents }, { data: sops }, { data: prefsRows }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id, email"),
        supabaseAdmin.from("applications").select("*"),
        supabaseAdmin.from("documents").select("*"),
        supabaseAdmin.from("sops").select("*"),
        supabaseAdmin.from("email_preferences").select("user_id, deadline_alerts"),
      ]);

    const emailByUserId = new Map((profiles ?? []).map((p) => [p.id, p.email]));
    // Default to enabled when a preference row is missing (same default as the
    // notifications routes and the existing send-alerts cron).
    const alertsEnabled = new Map(
      (prefsRows ?? []).map((p) => [
        p.user_id,
        (p as { deadline_alerts?: boolean }).deadline_alerts !== false,
      ]),
    );
    const docsByUser = groupByUser(documents ?? []);
    const sopsByUser = groupByUser(sops ?? []);

    const candidates: ReminderCandidate[] = [];
    for (const app of (applications ?? []) as Application[]) {
      if (onlyApplication && app.id !== onlyApplication) continue;
      if (isAppliedLikeStatus(app.status)) continue; // applied — no reminders
      const daysLeft = daysUntil(app.deadline);
      if (daysLeft === null || !MILESTONES.includes(daysLeft)) continue;
      const email = emailByUserId.get(app.user_id ?? "") ?? "";
      if (!email) continue;
      if (alertsEnabled.get(app.user_id ?? "") === false) continue;

      results.scanned++;
      const readiness = computeApplicationReadiness(
        app,
        docsByUser.get(app.user_id ?? "") ?? [],
        sopsByUser.get(app.user_id ?? "") ?? [],
      );
      candidates.push({
        userId: app.user_id ?? "",
        applicationId: app.id,
        email,
        scholarship: app.university,
        program: app.program,
        deadline: formatLongDate(app.deadline),
        daysLeft,
        progress: readiness.pct,
        missingItems: readiness.missingItems,
      });
    }
    results.candidates = candidates.length;

    for (const c of candidates) {
      const type = reminderType(c.daysLeft);
      if (await hasSentReminder(c.userId, c.applicationId, type)) {
        results.alreadySent++;
        continue;
      }
      if (dryRun) {
        results.dryRunEmails.push(c);
        continue;
      }

      const outcome = await sendApplicationEmail({
        to: c.email,
        subject: `Only ${c.daysLeft} ${c.daysLeft === 1 ? "day" : "days"} left: ${c.scholarship} deadline`,
        html: EmailTemplates.DeadlineReminder({
          scholarship: c.scholarship,
          program: c.program,
          deadline: c.deadline,
          daysLeft: c.daysLeft,
          progress: c.progress,
          missingItems: c.missingItems,
          applicationUrl: `https://scholarai.app/applications/${c.applicationId}`,
        }),
      });
      if (outcome.success) {
        await logSentReminder(c.userId, c.applicationId, type);
        results.emailsSent++;
      } else {
        // Never recorded as sent — the next run will retry.
        results.errors++;
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Deadline Reminders Cron Error:", error);
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

function groupByUser<T extends { user_id?: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const userId = row.user_id ?? "";
    const list = map.get(userId) ?? [];
    list.push(row);
    map.set(userId, list);
  }
  return map;
}