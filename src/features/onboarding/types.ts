export interface OnboardingProfile {
  first_name: string;
  last_name: string;
  phone_number?: string;
  country?: string;
  city?: string;
  education_level?: string;
  field_of_study?: string;
  university?: string;
  graduation_year?: number | null;
  gpa?: number | null;
  gpa_scale?: string;
}

export interface OnboardingPreferences {
  interests: string[];
  funding_preferences: string[];
  destinations: string[];
  degree_levels: string[];
  preferred_field?: string;
  tuition_preference?: string;
  max_tuition_budget?: number | null;
  ielts_status?: string;
  ielts_band?: number | null;
  preferred_intake: string[];
  needs_application_fee_waiver?: boolean;
  open_to_multiple_countries?: boolean;
}

export interface OnboardingData {
  profile: OnboardingProfile;
  preferences: OnboardingPreferences;
}