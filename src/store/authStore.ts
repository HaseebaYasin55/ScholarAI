import { create } from 'zustand';
import { supabase } from '@/lib/supabase-browser';
import { getAuthCallbackUrl } from '@/lib/auth-urls';
import type { OnboardingData } from '@/features/onboarding/types';

interface User {
  id: string;
  email: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  phone_number?: string;
  country?: string;
  city?: string;
  education_level?: string;
  major?: string;
  university?: string;
  graduation_year?: number | null;
  gpa?: number | null;
  gpa_scale?: string;
  onboarded_at?: string | null;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  initializeAuth: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  ensureProfile: (id: string, email: string) => Promise<void>;
  signInWithOAuth: (provider: 'google') => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
  updatePreferences: (updates: Record<string, unknown>) => Promise<void>;
  completeOnboarding: (data: OnboardingData) => Promise<void>;
}

async function fetchProfileForSession(): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  return {
    id: session.user.id,
    email: session.user.email ?? '',
    ...(profile ?? {}),
  } as User;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  initializeAuth: async () => {
    const user = await fetchProfileForSession();
    if (user) {
      set({ user, isAuthenticated: true, isLoading: false });
    } else {
      set({ isLoading: false });
    }
  },

  refreshProfile: async () => {
    const user = await fetchProfileForSession();
    if (user) set({ user, isAuthenticated: true });
  },

  ensureProfile: async (id: string, email: string) => {
    if (!id || !email) return;
    try {
      await supabase.from('profiles').upsert(
        { id, email },
        { onConflict: 'id' }
      );
    } catch (err) {
      // RLS may block profile insertion for brand-new users; never break auth.
      console.error('[ensureProfile] Could not upsert profile row:', err);
    }
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    await get().ensureProfile(data.user?.id ?? '', data.user?.email ?? '');

    const user = await fetchProfileForSession();
    if (user) set({ user, isAuthenticated: true });
  },

  signUp: async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getAuthCallbackUrl(),
      },
    });
    if (error) throw error;

    if (!data.session) {
      await get().ensureProfile(data.user?.id ?? '', data.user?.email ?? '');
      throw new Error(
        'Account created. Please check your email to confirm your account, then sign in.'
      );
    }

    await get().ensureProfile(data.user?.id ?? '', data.user?.email ?? '');

    const user = await fetchProfileForSession();
    if (user) set({ user, isAuthenticated: true });
  },

  signInWithOAuth: async (provider: 'google') => {
    const callback = getAuthCallbackUrl();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callback,
      },
    });
    if (error) throw error;
  },

  updateProfile: async (updates) => {
    const user = get().user;
    if (!user) throw new Error('No authenticated user found');

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const authenticatedEmail = session?.user?.email ?? user.email;
    if (!authenticatedEmail) throw new Error('No authenticated email found');

    const { data, error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        ...updates,
        email: authenticatedEmail,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    set({
      user: {
        ...user,
        ...data,
      },
    });
  },

  updatePreferences: async (updates) => {
    const user = get().user;
    if (!user) throw new Error('No authenticated user found');

    const { error } = await supabase
      .from('preferences')
      .upsert(
        { user_id: user.id, ...updates, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    if (error) throw error;
  },

  completeOnboarding: async (data) => {
    const user = get().user;
    if (!user) throw new Error('No authenticated user found');

    const now = new Date().toISOString();
    const firstName = (data.profile.first_name || '').trim();
    const lastName = (data.profile.last_name || '').trim();

    const profilePayload = {
      id: user.id,
      email: user.email,
      full_name: `${firstName} ${lastName}`.trim(),
      first_name: firstName,
      last_name: lastName,
      onboarded_at: now,
      updated_at: now,
      ...(data.profile.phone_number?.trim() ? { phone_number: data.profile.phone_number.trim() } : {}),
      ...(data.profile.country?.trim() ? { country: data.profile.country.trim() } : {}),
      ...(data.profile.city?.trim() ? { city: data.profile.city.trim() } : {}),
      ...(data.profile.education_level ? { education_level: data.profile.education_level } : {}),
      ...(data.profile.university?.trim() ? { university: data.profile.university.trim() } : {}),
      ...(data.profile.field_of_study?.trim() ? { major: data.profile.field_of_study.trim() } : {}),
      ...(data.profile.graduation_year != null ? { graduation_year: data.profile.graduation_year } : {}),
      ...(data.profile.gpa != null ? { gpa: data.profile.gpa } : {}),
      ...(data.profile.gpa_scale ? { gpa_scale: data.profile.gpa_scale } : {}),
    };

    const destinations =
      data.preferences.destinations.filter((d) => d !== 'other');

    const preferencesPayload = {
      user_id: user.id,
      interests: data.preferences.interests,
      funding_preferences: data.preferences.funding_preferences,
      destinations,
      degree_levels: data.preferences.degree_levels,
      preferred_field: data.preferences.preferred_field?.trim() || null,
      tuition_preference: data.preferences.tuition_preference || null,
      max_tuition_budget: data.preferences.max_tuition_budget ?? null,
      ielts_status: data.preferences.ielts_status || null,
      ielts_band: data.preferences.ielts_band ?? null,
      preferred_intake: data.preferences.preferred_intake,
      needs_application_fee_waiver: data.preferences.needs_application_fee_waiver ?? false,
      open_to_multiple_countries: data.preferences.open_to_multiple_countries ?? true,
      updated_at: now,
    };

    const [p1, p2] = await Promise.all([
      supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' }),
      supabase.from('preferences').upsert(preferencesPayload, { onConflict: 'user_id' }),
    ]);

    if (p1.error) {
      const e = p1.error;
      console.error('[completeOnboarding] Profile save failed:', {
        message: e.message,
        code: e.code,
        details: e.details,
        hint: e.hint,
      });
      throw new Error(`Could not save your profile: ${e.message} [${e.code}]`);
    }
    if (p2.error) {
      const e = p2.error;
      console.error('[completeOnboarding] Preferences save failed:', {
        message: e.message,
        code: e.code,
        details: e.details,
        hint: e.hint,
      });
      throw new Error(`Could not save your preferences: ${e.message} [${e.code}]`);
    }

    await get().refreshProfile();
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, isAuthenticated: false });
  },
}));