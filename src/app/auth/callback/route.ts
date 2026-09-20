import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  // Only allow redirects to same-origin paths to prevent open redirects.
  const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : null;

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // Ensure the basic profile row exists for the OAuth user. A row existing
      // does NOT mean the user is onboarded — onboarded_at stays NULL until the
      // user actually completes /onboarding.
      try {
        await supabase.from('profiles').upsert(
          {
            id: data.session.user.id,
            email: data.session.user.email ?? '',
            full_name:
              data.session.user.user_metadata?.full_name ||
              data.session.user.user_metadata?.name ||
              null,
            avatar_url: data.session.user.user_metadata?.avatar_url || null,
          },
          { onConflict: 'id' }
        );
      } catch (e) {
        console.error('[OAuth Callback] Could not ensure profile:', e);
      }

      // onboarded_at is the single source of truth for routing. A user whose
      // onboarded_at is NULL must always land on /onboarding — a "next" param
      // can never bypass that requirement.
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarded_at')
        .eq('id', data.session.user.id)
        .maybeSingle();

      const onboarded = Boolean(profile?.onboarded_at);

      // An explicit same-origin "next" is honoured, but only for fully
      // onboarded users.
      if (onboarded && safeNext) {
        return NextResponse.redirect(`${origin}${safeNext}`);
      }

      if (onboarded) {
        return NextResponse.redirect(`${origin}/dashboard`);
      }

      return NextResponse.redirect(`${origin}/onboarding`);
    }

    if (error) {
      console.error('[OAuth Callback] exchangeCodeForSession error:', error);
      return NextResponse.redirect(`${origin}/auth?error=${encodeURIComponent(error.message)}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth?error=${encodeURIComponent('Authentication could not be completed.')}`);
}