// End-to-end test for /api/cron/deadline-reminders.
//
// Seeds a fixture application with a deadline N days out (default 3, pass
// `1` to simulate "tomorrow"), then:
//   1. dry-run  -> verifies the reminder plan (scholarship, deadline,
//                  progress %, and real missing items).
//   2. live     -> verifies one email is attempted/queued for the fixture.
//   3. live     -> verifies dedup: nothing is emailed a second time.
// Always cleans up the fixture + its `sent_emails` rows.
//
// Usage:  node scripts/test-deadline-reminders.mjs [days-before]
//   days-before  an active reminder milestone (14, 7, 3, or 1). Use `1` to
//                simulate a deadline tomorrow. Defaults to 3.
// Requires a local dev server on the base URL (default http://localhost:3000)
// and `.env` with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// CRON_SECRET. The dry-run and onlyApplication params are disabled in
// production, so this script only works against a local/dev server.

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

// Load .env (Node 20.12+ supports loadEnvFile; fall back to a tiny parser).
if (typeof process.loadEnvFile === "function") {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} else {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

const BASE =
  process.env.TEST_BASE_URL && process.env.TEST_BASE_URL !== ""
    ? process.env.TEST_BASE_URL
    : "http://localhost:3000";

function fail(message) {
  console.error(`\n✖ ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) fail(message);
  else console.log(`  ✓ ${message}`);
}

const DAYS_BEFORE = (() => {
  const raw = process.argv[2];
  if (raw === undefined) return 3;
  const n = Number(raw);
  if (!Number.isInteger(n) || ![14, 7, 3, 1].includes(n)) {
    console.error("\n✖ days-before must be one of the reminder milestones: 14, 7, 3, or 1");
    process.exit(1);
  }
  return n;
})();

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronKey = process.env.CRON_SECRET;

  if (!url || !key) fail("Missing Supabase env vars in .env");
  if (!cronKey) fail("Missing CRON_SECRET in .env");
  if (!key || process.exitCode) return;

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1 ─ Seed a fixture application for an existing user.
  const { data: users, error: usersError } = await admin
    .from("profiles")
    .select("id, email")
    .limit(1);
  if (usersError || !users?.length) {
    fail(`No profile available to seed against (${usersError?.message ?? "none"})`);
    return;
  }
  const user = users[0];

  const deadline = new Date(Date.now() + DAYS_BEFORE * 864e5).toISOString().slice(0, 10);
  const fixture = {
    user_id: user.id,
    university: "ScholarAI End-to-End Test Scholarship",
    program: "To be selected",
    status: "Preparing",
    progress: 40,
    deadline,
    required_documents: ["Transcript"],
    requirements_reviewed: true,
  };

  console.log(`Seeding fixture for ${user.email} (deadline ${deadline})…`);
  const { data: app, error: seedError } = await admin
    .from("applications")
    .insert(fixture)
    .select()
    .single();
  if (seedError || !app) {
    fail(`Seed insert failed: ${seedError?.message ?? "no row returned"}`);
    return;
  }
  const appId = app.id;

  const params = (extra) => {
    const q = new URLSearchParams({ key: cronKey, ...extra });
    return `${BASE}/api/cron/deadline-reminders?${q.toString()}`;
  };

  try {
    // 2 ─ Dry run: the plan must include the fixture with real readiness data.
    console.log("\n1/3 Dry run (no emails sent)…");
    const dry = await (await fetch(params({ dryRun: "1", onlyApplication: appId }))).json();
    assert(dry.success === true && dry.mode === "dry-run", "dry-run returns success in dry-run mode");
    const plan = (dry.dryRunEmails ?? []).find((r) => r.applicationId === appId);
    assert(Boolean(plan), "fixture appears in the dry-run plan");
    if (plan) {
      assert(plan.scholarship === "ScholarAI End-to-End Test Scholarship", "scholarship name included");
      assert(plan.daysLeft === DAYS_BEFORE, `milestone is exactly ${DAYS_BEFORE} day(s) (got ${plan.daysLeft})`);
      assert(plan.deadline.length > 0, "human-readable deadline included");
      assert(typeof plan.progress === "number", "progress percentage included");
      assert(plan.progress > 0 && plan.progress <= 100, "progress is within 1–100");
      assert(
        plan.missingItems.includes("Transcript") &&
          plan.missingItems.includes("Statement of purpose (SOP)") &&
          plan.missingItems.includes("Program not selected"),
        "missing items list the actual gaps (Transcript, SOP, program)",
      );
    }

    // 3 ─ Live run: emails the fixture once, then dedup on a second run.
    console.log("\n2/3 Live run (sends real email to the seeded fixture)…");
    const live = await (await fetch(params({ onlyApplication: appId }))).json();
    assert(live.mode === "live", "live run is in live mode");
    assert(live.emailsSent + live.errors === 1, "one reminder attempted for the fixture");
    if (live.emailsSent === 1) {
      console.log("  ✓ Resend accepted the email");
    } else {
      console.log(`  ⚠ Resend rejected it (errors=${live.errors}) — check RESEND_API_KEY/domain.
     Full response: ${JSON.stringify(live, null, 2)}`);
    }

    console.log("\n3/3 Dedup check (second live run)…");
    const second = await (await fetch(params({ onlyApplication: appId }))).json();
    const fullyDeduped = second.emailsSent === 0 && second.alreadySent >= 1;
    assert(fullyDeduped, "no duplicate email on the second run (sent_emails logged)");

    console.log(
      `\nDone. live=${live.emailsSent} sent / ${live.errors} errors · ` +
        `repeat=${second.alreadySent} already-sent / ${second.emailsSent} re-sent`,
    );
  } finally {
    console.log("\nCleaning up fixture…");
    await admin.from("applications").delete().eq("id", appId);
    await admin.from("sent_emails").delete().eq("notification_id", appId);
    console.log("Cleanup complete.");
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
});