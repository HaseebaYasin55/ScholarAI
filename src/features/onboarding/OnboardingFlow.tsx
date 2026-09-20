"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import Logo from "@/components/Logo";
import ChipGroup from "@/features/onboarding/components/ChipGroup";
import { Field, inputClass } from "@/features/onboarding/components/Field";
import Progress from "@/features/onboarding/components/Progress";
import {
  DEGREE_LEVELS,
  DESTINATIONS,
  EDUCATION_LEVELS,
  FUNDING_OPTIONS,
  GPA_SCALES,
  GRADUATION_YEARS,
  IELT_BANDS,
  IELT_STATUSES,
  INTAKES,
  INTEREST_OPTIONS,
  TUITION_PREFERENCES,
} from "@/features/onboarding/data";
import type { OnboardingData, OnboardingPreferences, OnboardingProfile } from "@/features/onboarding/types";

interface FormState extends OnboardingProfile, OnboardingPreferences {
  other_destination?: string;
}

interface Guide {
  title: string;
  sub: string;
  why: string;
  next: string;
}

const GUIDE: Guide[] = [
  {
    title: "Let's get to know you.",
    sub: "Tell us a little about yourself so we can find opportunities that actually fit you.",
    why: "Where you are and how to reach you shape everything we search on your behalf.",
    next: "Next we'll ask about your education.",
  },
  {
    title: "Tell us about your education.",
    sub: "Almost every scholarship and university checks this first — it is the foundation of eligibility.",
    why: "Your academic background powers eligibility checks and degree-level matching.",
    next: "Next we'll ask what you're looking for.",
  },
  {
    title: "What are you looking for?",
    sub: "Pick what matters to you. This becomes the lens your recommendations are filtered through.",
    why: "The more specific you are, the sharper every match will be.",
    next: "Next, a few final preferences.",
  },
  {
    title: "Almost there — final preferences.",
    sub: "A few small details that separate a realistic shortlist from a fantasy one.",
    why: "Budget, language tests and timing are where most applications fall through.",
    next: "Then we'll build your profile.",
  },
];

function initialForm(user: ReturnType<typeof useAuthStore.getState>["user"]): FormState {
  return {
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    phone_number: user?.phone_number ?? "",
    country: user?.country ?? "",
    city: user?.city ?? "",
    education_level: user?.education_level ?? "",
    field_of_study: user?.major ?? "",
    university: user?.university ?? "",
    graduation_year: user?.graduation_year ?? null,
    gpa: user?.gpa ?? null,
    gpa_scale: user?.gpa_scale ?? "",
    interests: [],
    funding_preferences: [],
    destinations: [],
    degree_levels: [],
    preferred_field: user?.major ?? "",
    tuition_preference: "",
    max_tuition_budget: null,
    ielts_status: "",
    ielts_band: null,
    preferred_intake: [],
    needs_application_fee_waiver: false,
    open_to_multiple_countries: true,
  };
}

function validate(step: number, f: FormState): Record<string, string> {
  const errs: Record<string, string> = {};
  if (step === 0) {
    if (!f.first_name.trim()) errs.first_name = "Required";
    if (!f.last_name.trim()) errs.last_name = "Required";
  } else if (step === 1) {
    if (!f.education_level) errs.education_level = "Pick one";
    if (!f.field_of_study?.trim()) errs.field_of_study = "Required";
    if (f.gpa != null && !f.gpa_scale) errs.gpa_scale = "Pick a scale";
  } else if (step === 2) {
    if (f.interests.length === 0) errs.interests = "Select at least one";
    if (f.degree_levels.length === 0) errs.degree_levels = "Select at least one";
    if (f.destinations.length === 0 && !f.other_destination?.trim()) errs.destinations = "Pick at least one";
  } else if (step === 3) {
    if (f.ielts_status === "completed" && f.ielts_band == null) errs.ielts = "Select your band";
  }
  return errs;
}

function BuildingView() {
  const TASKS = ["Saving your details", "Structuring your preferences", "Preparing your workspace"];
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (count >= TASKS.length) return;
    const t = setTimeout(() => setCount((c) => c + 1), 560);
    return () => clearTimeout(t);
  }, [count, TASKS.length]);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_20px_50px_-30px_rgba(0,0,0,0.3)]">
      <div className="border-b border-gray-100 px-6 py-8 sm:px-10">
        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-gray-400">
          Profile · Final step
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">
          Building your study-abroad profile…
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Setting up the foundation for your scholarships, universities and deadlines.
        </p>
      </div>
      <div className="px-6 py-8 sm:px-10">
        <ul className="space-y-4">
          {TASKS.map((task, i) => (
            <li key={task} className="flex items-center gap-3 text-sm">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  i < count
                    ? "border-gray-900 bg-gray-900 text-white"
                    : i === count
                      ? "border-gray-300"
                      : "border-gray-200 text-gray-300"
                }`}
              >
                {i < count ? (
                  <Check className="h-3.5 w-3.5" />
                ) : i === count ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
                ) : null}
              </span>
              <span className={i <= count ? "text-gray-700" : "text-gray-400"}>{task}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function OnboardingFlow() {
  const user = useAuthStore((s) => s.user);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(() => initialForm(user));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [building, setBuilding] = useState(false);

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const validateAndStep = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(step, form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (step < 3) {
      setStep((s) => s + 1);
      return;
    }
    submit();
  };

  const submit = async () => {
    const destinations = [...form.destinations.filter((d) => d !== "other")];
    if (form.destinations.includes("other") && form.other_destination?.trim()) {
      destinations.push(form.other_destination.trim());
    }

    setBuilding(true);
    const data: OnboardingData = {
      profile: {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone_number: form.phone_number?.trim(),
        country: form.country?.trim(),
        city: form.city?.trim(),
        education_level: form.education_level,
        field_of_study: form.field_of_study?.trim(),
        university: form.university?.trim(),
        graduation_year: form.graduation_year ?? null,
        gpa: form.gpa ?? null,
        gpa_scale: form.gpa_scale,
      },
      preferences: {
        interests: form.interests,
        funding_preferences: form.funding_preferences,
        destinations,
        degree_levels: form.degree_levels,
        preferred_field: form.preferred_field?.trim(),
        tuition_preference: form.tuition_preference,
        max_tuition_budget: form.max_tuition_budget ?? null,
        ielts_status: form.ielts_status,
        ielts_band: form.ielts_band ?? null,
        preferred_intake: form.preferred_intake,
        needs_application_fee_waiver: form.needs_application_fee_waiver,
        open_to_multiple_countries: form.open_to_multiple_countries,
      },
    };

    try {
      await Promise.all([completeOnboarding(data), new Promise((r) => setTimeout(r, 1400))]);
      router.replace("/dashboard");
    } catch (err) {
      setBuilding(false);
      setErrors({ _form: err instanceof Error ? err.message : "Something went wrong. Please try again." });
    }
  };

  const destinationOptions = [
    ...DESTINATIONS.map((d) => ({ value: d, label: d })),
    { value: "other", label: "Other" },
  ];

  const showBudget = form.tuition_preference !== "" && form.tuition_preference !== "fully_funded_only";

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-6">
          <Logo />
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-gray-400">
            {building ? "Finalizing" : "Profile setup"}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-10 sm:py-14">
        {building ? (
          <BuildingView />
        ) : (
          <div key={step} className="rise-in overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_20px_50px_-30px_rgba(0,0,0,0.3)]">
            <div className="border-b border-gray-100 px-6 py-5 sm:px-10">
              <Progress current={step} />
            </div>

            <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
              {/* Consultant guide */}
              <div className="border-b border-gray-100 px-6 py-8 sm:px-10 lg:border-b-0 lg:border-r">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-gray-400">
                  Step {String(step + 1).padStart(2, "0")} of 04
                </p>
                <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-gray-900 sm:text-[1.7rem]">
                  {GUIDE[step].title}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-gray-500">{GUIDE[step].sub}</p>
                <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">Why we ask</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-gray-600">{GUIDE[step].why}</p>
                </div>
                <p className="mt-5 text-xs text-gray-400">→ {GUIDE[step].next}</p>
              </div>

              {/* Form */}
              <div className="px-6 py-8 sm:px-10">
                <form onSubmit={validateAndStep} noValidate className="space-y-6">
                  {errors._form && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
                      {errors._form}
                    </div>
                  )}

                  {step === 0 && (
                    <>
                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field label="First name" required error={errors.first_name} id="first_name">
                          <input
                            id="first_name"
                            autoComplete="given-name"
                            value={form.first_name}
                            onChange={(e) => patch("first_name", e.target.value)}
                            className={inputClass}
                            placeholder="Ada"
                          />
                        </Field>
                        <Field label="Last name" required error={errors.last_name} id="last_name">
                          <input
                            id="last_name"
                            autoComplete="family-name"
                            value={form.last_name}
                            onChange={(e) => patch("last_name", e.target.value)}
                            className={inputClass}
                            placeholder="Lovelace"
                          />
                        </Field>
                      </div>

                      <Field label="Email" hint="Connected to your account. We'll never ask you to type it again." id="email">
                        <input type="email" value={user?.email ?? ""} readOnly disabled className={inputClass} />
                      </Field>

                      <Field label="Phone number" hint="Only used for important updates and support." id="phone_number">
                        <input
                          id="phone_number"
                          type="tel"
                          autoComplete="tel"
                          value={form.phone_number ?? ""}
                          onChange={(e) => patch("phone_number", e.target.value)}
                          className={inputClass}
                          placeholder="+1 (555) 000-0000"
                        />
                      </Field>

                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field label="Current country" id="country">
                          <input
                            id="country"
                            autoComplete="country-name"
                            value={form.country ?? ""}
                            onChange={(e) => patch("country", e.target.value)}
                            className={inputClass}
                            placeholder="e.g. Pakistan"
                          />
                        </Field>
                        <Field label="Current city" id="city">
                          <input
                            id="city"
                            autoComplete="address-level2"
                            value={form.city ?? ""}
                            onChange={(e) => patch("city", e.target.value)}
                            className={inputClass}
                            placeholder="e.g. Lahore"
                          />
                        </Field>
                      </div>
                    </>
                  )}

                  {step === 1 && (
                    <>
                      <Field label="Highest / current education level" required error={errors.education_level} hint="As of today — this is how we check eligibility.">
                        <ChipGroup
                          options={EDUCATION_LEVELS.map((l) => ({ value: l, label: l }))}
                          values={form.education_level ? [form.education_level] : []}
                          onChange={(v) => patch("education_level", v[0] ?? "")}
                          single
                        />
                      </Field>

                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field label="Field of study" required error={errors.field_of_study} id="field_of_study">
                          <input
                            id="field_of_study"
                            value={form.field_of_study ?? ""}
                            onChange={(e) => patch("field_of_study", e.target.value)}
                            className={inputClass}
                            placeholder="e.g. Computer Science"
                          />
                        </Field>
                        <Field label="University" id="university">
                          <input
                            id="university"
                            value={form.university ?? ""}
                            onChange={(e) => patch("university", e.target.value)}
                            className={inputClass}
                            placeholder="Current or last university"
                          />
                        </Field>
                      </div>

                      <div className="grid gap-5 sm:grid-cols-3">
                        <Field label="Graduation year" id="graduation_year">
                          <select
                            id="graduation_year"
                            value={form.graduation_year ?? ""}
                            onChange={(e) => patch("graduation_year", e.target.value ? Number(e.target.value) : null)}
                            className={inputClass}
                          >
                            <option value="">—</option>
                            {GRADUATION_YEARS.map((y) => (
                              <option key={y} value={y}>
                                {y}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="GPA / CGPA" hint="Your latest cumulative average." id="gpa">
                          <input
                            id="gpa"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            value={form.gpa ?? ""}
                            onChange={(e) => patch("gpa", e.target.value === "" ? null : Number(e.target.value))}
                            className={inputClass}
                            placeholder="3.6"
                          />
                        </Field>
                        <Field label="GPA scale" error={errors.gpa_scale} id="gpa_scale">
                          <select
                            id="gpa_scale"
                            value={form.gpa_scale ?? ""}
                            onChange={(e) => patch("gpa_scale", e.target.value)}
                            className={inputClass}
                          >
                            <option value="">—</option>
                            {GPA_SCALES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                    </>
                  )}

                  {step === 2 && (
                    <>
                      <Field label="What are you interested in?" required error={errors.interests}>
                        <ChipGroup
                          options={INTEREST_OPTIONS}
                          values={form.interests}
                          onChange={(v) => patch("interests", v)}
                          variant="card"
                        />
                      </Field>

                      <Field label="Funding preference" hint="Select all that work for you.">
                        <ChipGroup
                          options={FUNDING_OPTIONS}
                          values={form.funding_preferences}
                          onChange={(v) => patch("funding_preferences", v)}
                          variant="card"
                        />
                      </Field>

                      <Field label="Preferred study destinations" required error={errors.destinations} hint="Tap a destination. We keep this list expandable — 'Other' lets you add any country.">
                        <ChipGroup options={destinationOptions} values={form.destinations} onChange={(v) => patch("destinations", v)} />
                        {form.destinations.includes("other") && (
                          <input
                            value={form.other_destination ?? ""}
                            onChange={(e) => patch("other_destination", e.target.value)}
                            className={`${inputClass} mt-3`}
                            placeholder="Type your destination"
                          />
                        )}
                      </Field>

                      <Field label="Degree level" required error={errors.degree_levels} hint="Which level are you applying for?">
                        <ChipGroup
                          options={DEGREE_LEVELS.map((l) => ({ value: l, label: l }))}
                          values={form.degree_levels}
                          onChange={(v) => patch("degree_levels", v)}
                        />
                      </Field>
                    </>
                  )}

                  {step === 3 && (
                    <>
                      <Field label="Preferred field for study abroad" hint="Same as your current field? It's prefilled — change it if you're looking further afield." id="preferred_field">
                        <input
                          id="preferred_field"
                          value={form.preferred_field ?? ""}
                          onChange={(e) => patch("preferred_field", e.target.value)}
                          className={inputClass}
                          placeholder="e.g. Data Science"
                        />
                      </Field>

                      <Field label="Budget / tuition preference" hint="Sets a baseline so we never suggest something out of reach.">
                        <ChipGroup
                          options={TUITION_PREFERENCES}
                          values={form.tuition_preference ? [form.tuition_preference] : []}
                          onChange={(v) => patch("tuition_preference", v[0] ?? "")}
                          single
                        />
                        {showBudget && (
                          <div className="mt-3">
                            <label htmlFor="max_budget" className="mb-1.5 block text-[13px] font-medium text-gray-700">
                              Maximum tuition budget (USD / year)
                            </label>
                            <input
                              id="max_budget"
                              type="number"
                              inputMode="numeric"
                              value={form.max_tuition_budget ?? ""}
                              onChange={(e) => patch("max_tuition_budget", e.target.value === "" ? null : Number(e.target.value))}
                              className={inputClass}
                              placeholder="15000"
                            />
                          </div>
                        )}
                      </Field>

                      <Field label="IELTS / English proficiency" error={errors.ielts} hint="Many scholarships filter by this. We'll only ask once.">
                        <ChipGroup
                          options={IELT_STATUSES}
                          values={form.ielts_status ? [form.ielts_status] : []}
                          onChange={(v) => patch("ielts_status", v[0] ?? "")}
                          single
                        />
                        {form.ielts_status === "completed" && (
                          <div className="mt-3">
                            <label htmlFor="ielts_band" className="mb-1.5 block text-[13px] font-medium text-gray-700">
                              Your band
                            </label>
                            <ChipGroup
                              options={IELT_BANDS.map((b) => ({ value: b, label: b }))}
                              values={form.ielts_band != null ? [String(form.ielts_band)] : []}
                              onChange={(v) => patch("ielts_band", v[0] ? Number(v[0]) : null)}
                              single
                            />
                          </div>
                        )}
                      </Field>

                      <Field label="Preferred intake" hint="When you'd like to start.">
                        <ChipGroup
                          options={[...INTAKES.map((i) => ({ value: i, label: i })), { value: "Anytime", label: "Anytime" }]}
                          values={form.preferred_intake}
                          onChange={(v) => patch("preferred_intake", v)}
                        />
                      </Field>

                      <div className="grid gap-5 sm:grid-cols-2">
                        <Field label="Need application fee waivers?" hint="Some programs waive fees for strong candidates.">
                          <ChipGroup
                            options={[
                              { value: "yes", label: "Yes" },
                              { value: "no", label: "No" },
                            ]}
                            values={[form.needs_application_fee_waiver ? "yes" : "no"]}
                            onChange={(v) => patch("needs_application_fee_waiver", v[0] === "yes")}
                            single
                          />
                        </Field>
                        <Field label="Open to studying in multiple countries?" hint="Massively widens the shortlist.">
                          <ChipGroup
                            options={[
                              { value: "yes", label: "Yes" },
                              { value: "no", label: "No" },
                            ]}
                            values={[form.open_to_multiple_countries ? "yes" : "no"]}
                            onChange={(v) => patch("open_to_multiple_countries", v[0] === "yes")}
                            single
                          />
                        </Field>
                      </div>
                    </>
                  )}

                  <div className="flex items-center justify-between border-t border-gray-100 pt-6">
                    {step > 0 ? (
                      <button
                        type="button"
                        onClick={() => setStep((s) => s - 1)}
                        className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                      >
                        <ArrowLeft className="h-4 w-4" /> Back
                      </button>
                    ) : (
                      <span />
                    )}
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-xl border border-transparent bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_6px_14px_rgba(0,0,0,0.25)] transition-all duration-200 hover:bg-gray-800 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_20px_rgba(0,0,0,0.3)] active:translate-y-px"
                    >
                      {step === 3 ? "Build My Profile" : "Continue"}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}