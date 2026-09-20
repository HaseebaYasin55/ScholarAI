# Supabase Setup Guide for ScholarAI

This document outlines the complete process for setting up the Supabase backend for the ScholarAI application.

## 1. Supabase Project Configuration

1.  **Create Project**: Log in to [Supabase](https://supabase.com/) and create a new project.
2.  **Database Password**: Save your database password securely.
3.  **Region**: Choose a region close to your target users.

## 2. Environment Variables

Create a `.env.local` file in the root of the `frontend` directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
RESEND_API_KEY=re_your_resend_api_key
CRON_SECRET=your_random_secret_string
```

*   **URL**: Found in Project Settings $\rightarrow$ API.
*   **Anon Key**: Found in Project Settings $\rightarrow$ API.

## 3. Database Schema & Migrations

The database schema is defined in `supabase/migrations/001_initial_schema.sql`.

### How to apply the SQL:
1.  Go to the **SQL Editor** in the Supabase Dashboard.
2.  Click **New Query**.
3.  Paste the entire content of `supabase/migrations/001_initial_schema.sql`, `supabase/migrations/002_sops_table.sql`, and `supabase/migrations/004_email_alerts.sql`.
4.  Click **Run**.

### Schema Overview:
- **`profiles`**: User metadata linked to `auth.users`.
- **`applications`**: Core application tracking data.
- **`documents`**: Requirements for each university.
- **`deadlines`**: Timeline of all critical dates.
- **`notifications`**: User alerts and system messages.
- **`email_preferences`**: User opt-in/out for email alerts.
- **`sent_emails`**: Log of sent emails to prevent duplicates.

## 4. Security & RLS Policies

Row Level Security (RLS) is enabled on all tables. The policies ensure that:
- Users can only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` records where `user_id == auth.uid()`.
- Profile access is restricted to the owner.

## 5. Authentication Setup

1.  Navigate to **Authentication** $\rightarrow$ **Providers**.
2.  Ensure **Email/Password** is enabled.
3.  (Optional) Disable "Confirm Email" if you want users to be able to log in immediately without verification for testing.

## 6. Storage Configuration (Future Use)

If document uploads are required:
1.  Create a bucket named `documents`.
2.  Set the bucket to **Private**.
3.  Add an RLS policy allowing users to upload/view files only in a folder named after their `auth.uid()`.

## 7. Email Service & Automation
The application uses **Resend** for transactional emails.

1. **Resend Setup**:
   - Create an account at [resend.com](https://resend.com).
   - Verify your domain to send emails from `notifications@yourdomain.com`.
   - Generate an API Key and add it as `RESEND_API_KEY` in `.env.local`.

2. **Cron Job Setup**:
   - The email alerts are triggered via `GET /api/cron/send-alerts?key=<CRON_SECRET>`.
   - Use a cron service (e.g., Vercel Cron, GitHub Actions, or Upstash) to call this endpoint every 24 hours.
   - The `CRON_SECRET` should be a secure string shared between your cron service and the `.env.local` file.

3. **Database Tables**:
   - Ensure `004_email_alerts.sql` is applied to create the `email_preferences` and `sent_emails` tables.

## 8. Application Connection

The frontend connects to Supabase using the `@supabase/supabase-js` client.
- **Client**: `src/lib/supabase.ts`
- **State Management**: The app uses a hybrid approach where Supabase is the source of truth, and Zustand provides a lightweight reactive cache for the UI.
