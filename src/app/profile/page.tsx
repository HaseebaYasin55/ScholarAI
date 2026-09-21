"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  Mail,
  Save,
  X,
  Upload,
  FileText,
  Trash2,
  RefreshCw,
  Eye,
  PencilLine,
  GraduationCap,
  MapPin,
  SlidersHorizontal,
  CheckCircle2,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';
import type { Document } from '@/store/appStore';
import { supabase } from '@/lib/supabase-browser';
import { describeError, logError } from '@/lib/errors';
import Header from '@/components/Header';
import ChipGroup from '@/features/onboarding/components/ChipGroup';
import { Field, inputClass } from '@/features/onboarding/components/Field';
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
} from '@/features/onboarding/data';

type AuthUser = ReturnType<typeof useAuthStore.getState>["user"];

interface ProfileForm {
  first_name: string;
  last_name: string;
  phone_number: string;
  country: string;
  city: string;
  education_level: string;
  field_of_study: string;
  university: string;
  graduation_year: string;
  gpa: string;
  gpa_scale: string;
}

interface PrefsForm {
  interests: string[];
  funding_preferences: string[];
  destinations: string[];
  degree_levels: string[];
  preferred_field: string;
  tuition_preference: string;
  max_tuition_budget: string;
  ielts_status: string;
  ielts_band: string;
  preferred_intake: string[];
  needs_application_fee_waiver: boolean;
  open_to_multiple_countries: boolean;
}

interface PrefsRow {
  interests?: string[];
  funding_preferences?: string[];
  destinations?: string[];
  degree_levels?: string[];
  preferred_field?: string | null;
  tuition_preference?: string | null;
  max_tuition_budget?: number | null;
  ielts_status?: string | null;
  ielts_band?: number | null;
  preferred_intake?: string[];
  needs_application_fee_waiver?: boolean;
  open_to_multiple_countries?: boolean;
}

const DOC_TYPE_CV = 'CV / Resume';
const DOC_TYPE_TRANSCRIPT = 'Transcript';
const DOC_TYPE_SUPPORTING = 'Supporting Documents';

const SINGLE_DOC_TYPES = [DOC_TYPE_CV, DOC_TYPE_TRANSCRIPT] as const;

function documentFileName(doc: Document): string {
  return doc.file_path?.split('/').pop() ?? doc.name;
}

function documentExt(doc: Document): string {
  const name = documentFileName(doc);
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function validateDocumentFile(file: File): string | null {
  const allowedExtensions = ['pdf', 'doc', 'docx'];
  const fileExt = file.name.split('.').pop()?.toLowerCase();
  if (!fileExt || !allowedExtensions.includes(fileExt)) {
    return 'Invalid file format. Please upload PDF, DOC, or DOCX.';
  }
  if (file.size > 5 * 1024 * 1024) {
    return 'File size exceeds the 5MB limit.';
  }
  return null;
}

function profileToForm(u: AuthUser): ProfileForm {
  return {
    first_name: u?.first_name ?? '',
    last_name: u?.last_name ?? '',
    phone_number: u?.phone_number ?? '',
    country: u?.country ?? '',
    city: u?.city ?? '',
    education_level: u?.education_level ?? '',
    field_of_study: u?.major ?? '',
    university: u?.university ?? '',
    graduation_year: u?.graduation_year != null ? String(u.graduation_year) : '',
    gpa: u?.gpa != null ? String(u.gpa) : '',
    gpa_scale: u?.gpa_scale ?? '',
  };
}

function prefsToForm(p: PrefsRow | null): PrefsForm {
  return {
    interests: p?.interests ?? [],
    funding_preferences: p?.funding_preferences ?? [],
    destinations: p?.destinations ?? [],
    degree_levels: p?.degree_levels ?? [],
    preferred_field: p?.preferred_field ?? '',
    tuition_preference: p?.tuition_preference ?? '',
    max_tuition_budget: p?.max_tuition_budget != null ? String(p.max_tuition_budget) : '',
    ielts_status: p?.ielts_status ?? '',
    ielts_band: p?.ielts_band != null ? String(p.ielts_band) : '',
    preferred_intake: p?.preferred_intake ?? [],
    needs_application_fee_waiver: p?.needs_application_fee_waiver ?? false,
    open_to_multiple_countries: p?.open_to_multiple_countries ?? true,
  };
}

function initialsFor(user: AuthUser): string {
  const first = (user?.first_name || '').trim();
  const last = (user?.last_name || '').trim();
  if (first || last) return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
  const full = (user?.full_name || '').trim();
  if (full)
    return full
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase();
  return (user?.email?.[0] || 'S').toUpperCase();
}

function ValueRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-gray-900">
        {value || <span className="text-gray-400">Not specified</span>}
      </p>
    </div>
  );
}

function SectionCard({
  eyebrow,
  title,
  desc,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm">
      <div className="p-6 border-b border-gray-100 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-900 text-white">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
            {eyebrow}
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h2>
          <p className="text-xs text-gray-400">{desc}</p>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function DocumentStatusBadge({ status }: { status: Document['status'] }) {
  const submitted = status === 'Submitted';
  return (
    <span
      className={`shrink-0 px-2 py-1 text-xs font-medium rounded-full border ${
        submitted
          ? 'border-gray-900 bg-gray-900 text-white'
          : 'border-gray-200 bg-gray-50 text-gray-600'
      }`}
    >
      {status}
    </span>
  );
}

function DocumentManageActions({
  doc,
  replacing,
  onView,
  onReplace,
  onDelete,
}: {
  doc: Document;
  replacing: boolean;
  onView: (doc: Document) => void;
  onReplace: (e: React.ChangeEvent<HTMLInputElement>, doc: Document) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        onClick={() => onView(doc)}
        disabled={!doc.file_path}
        className="p-2 text-gray-400 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
        title={doc.file_path ? 'Open document' : 'No file attached'}
      >
        <Eye className="h-4 w-4" />
      </button>
      {doc.status === 'Submitted' && doc.file_path ? (
        <label
          className={`inline-flex rounded-lg transition-colors ${
            replacing ? 'cursor-wait' : 'hover:bg-gray-50 cursor-pointer'
          }`}
          title={replacing ? 'Replacing…' : 'Replace document'}
        >
          <input
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx"
            disabled={replacing}
            onChange={(e) => onReplace(e, doc)}
          />
          <span className="p-2 text-gray-400">
            {replacing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </span>
        </label>
      ) : null}
      <button
        onClick={() => onDelete(doc.id)}
        disabled={replacing}
        className="p-2 text-gray-400 hover:text-gray-900 transition-colors rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed"
        title="Remove document"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function UploadTrigger({
  label,
  uploading,
  onUpload,
}: {
  label: string;
  uploading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label
      className={`inline-flex shrink-0 items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-500 transition-colors ${
        uploading ? 'cursor-wait opacity-60' : 'cursor-pointer hover:border-gray-900 hover:text-gray-900'
      }`}
      title={`Upload ${label}`}
    >
      <input
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx"
        disabled={uploading}
        onChange={onUpload}
      />
      {uploading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Upload className="h-4 w-4" />
      )}
      {uploading ? 'Uploading…' : label}
    </label>
  );
}

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading, updateProfile, updatePreferences, refreshProfile } =
    useAuthStore();
  const { documents, addDocument, uploadDocumentFile, replaceDocumentFile, deleteDocument } = useAppStore();
  const router = useRouter();

  const [isEditing, setIsEditing] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('edit') === '1';
  });
  const [isSaving, setIsSaving] = useState(false);
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<ProfileForm>(() => profileToForm(user));
  const [prefs, setPrefs] = useState<PrefsForm>(() => prefsToForm(null));
  const [savedPrefs, setSavedPrefs] = useState<PrefsForm>(() => prefsToForm(null));
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  const [replacingDoc, setReplacingDoc] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/auth');
    }
  }, [isLoading, isAuthenticated, router]);

  // Clean up "?edit=1" from the URL without touching state (state is already
  // initialized from the query param above).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('edit') === '1') {
      window.history.replaceState({}, '', '/profile');
    }
  }, []);

  // Load preferences once the auth store has a user.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      setPrefsLoading(true);
      const res = await supabase
        .from('preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle<PrefsRow>();

      if (cancelled) return;
      if (res.error) console.error('[Profile] Could not load preferences:', res.error.message);
      const loaded = prefsToForm(res.data ?? null);
      setForm(profileToForm(user));
      setPrefs(loaded);
      setSavedPrefs(loaded);
      setPrefsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const patch = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const patchPrefs = <K extends keyof PrefsForm>(key: K, value: PrefsForm[K]) => {
    setPrefs((f) => ({ ...f, [key]: value }));
  };

  const startEditing = () => {
    setError('');
    setSuccess('');
    setForm(profileToForm(useAuthStore.getState().user));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setForm(profileToForm(useAuthStore.getState().user));
    setPrefs(savedPrefs);
    setIsEditing(false);
    setError('');
    setSuccess('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsSaving(true);

    try {
      const firstName = form.first_name.trim();
      const lastName = form.last_name.trim();

      // Save to profiles. onboarded_at is deliberately never included here so
      // editing the profile can never reset the completion marker.
      await updateProfile({
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`.trim(),
        phone_number: form.phone_number.trim(),
        country: form.country.trim(),
        city: form.city.trim(),
        education_level: form.education_level,
        university: form.university.trim(),
        major: form.field_of_study.trim(),
        graduation_year: form.graduation_year ? Number(form.graduation_year) : null,
        gpa: form.gpa !== '' ? Number(form.gpa) : null,
        gpa_scale: form.gpa_scale,
      });

      await updatePreferences({
        interests: prefs.interests,
        funding_preferences: prefs.funding_preferences,
        destinations: prefs.destinations,
        degree_levels: prefs.degree_levels,
        preferred_field: prefs.preferred_field.trim() || null,
        tuition_preference: prefs.tuition_preference || null,
        max_tuition_budget: prefs.max_tuition_budget !== '' ? Number(prefs.max_tuition_budget) : null,
        ielts_status: prefs.ielts_status || null,
        ielts_band: prefs.ielts_band !== '' ? Number(prefs.ielts_band) : null,
        preferred_intake: prefs.preferred_intake,
        needs_application_fee_waiver: prefs.needs_application_fee_waiver,
        open_to_multiple_countries: prefs.open_to_multiple_countries,
      });

      await refreshProfile();
      setForm(profileToForm(useAuthStore.getState().user));
      setSavedPrefs(prefs);
      setIsEditing(false);
      setSuccess('Your profile has been saved.');
    } catch (err: unknown) {
      logError('profile save', err);
      setError(describeError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: string) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const validationError = validateDocumentFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSuccess('');
    setUploadingDoc(docType);

    try {
      let docId: string;

      // CV and Transcript are single slots: reuse an existing row (even a
      // leftover Pending one) so re-uploading never creates duplicates.
      const reuseExisting = (SINGLE_DOC_TYPES as readonly string[]).includes(docType);
      const existing = reuseExisting
        ? documents.find((d) => d.university === 'General' && d.name === docType)
        : undefined;

      try {
        if (existing) {
          docId = existing.id;
        } else {
          docId = await addDocument({
            name: docType,
            university: 'General',
            status: 'Pending',
            description: 'Global Profile Document',
            deadline: '',
          });
        }
      } catch (err: unknown) {
        logError(`upload "${docType}": create document row`, err);
        throw new Error(
          `Could not create the document record: ${describeError(err)}`
        );
      }

      try {
        await uploadDocumentFile(docId, file);
      } catch (err: unknown) {
        logError(`upload "${docType}": store file in storage`, err);
        throw new Error(
          `Could not store the file: ${describeError(err)}`
        );
      }

      setSuccess(`${docType} uploaded successfully.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : describeError(err);
      setError(`Failed to upload ${docType}: ${message}`);
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleReplaceDocument = async (
    e: React.ChangeEvent<HTMLInputElement>,
    doc: Document
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const validationError = validateDocumentFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setSuccess('');
    setReplacingDoc(doc.id);

    try {
      await replaceDocumentFile(doc.id, file, doc.file_path);
      setSuccess(`${doc.name} replaced successfully.`);
    } catch (err: unknown) {
      logError(`replace "${doc.name}"`, err);
      setError(`Failed to replace ${doc.name}: ${describeError(err)}`);
    } finally {
      setReplacingDoc(null);
    }
  };

  const handleRemoveDocument = async (id: string) => {
    try {
      await deleteDocument(id);
    } catch (err: unknown) {
      logError('remove document', err);
      setError(`Failed to remove document: ${describeError(err)}`);
    }
  };

  const handleViewDocument = async (doc: Document) => {
    if (!doc.file_path) return;

    setError('');
    setSuccess('');
    try {
      const { data, error } = await supabase.storage
        .from('documents')
        .createSignedUrl(doc.file_path, 3600);

      if (error) throw error;
      if (!data?.signedUrl) throw new Error('Could not create a signed URL for this document.');

      // PDFs render inline in the browser; DOC/DOCX trigger the browser's
      // default download/open handling. The signed URL keeps the file locked
      // to the authenticated user (private bucket + RLS), so it is never
      // exposed publicly.
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      logError('view document', err);
      setError(`Could not open the document: ${describeError(err)}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const showBudget =
    prefs.tuition_preference !== '' && prefs.tuition_preference !== 'fully_funded_only';
  const displayName = user?.full_name || 'Unnamed Student';
  const location = [user?.city, user?.country].filter(Boolean).join(', ');

  const generalDocs = documents.filter((d) => d.university === 'General');
  const cvDoc = generalDocs.find(
    (d) => d.name === DOC_TYPE_CV && d.status === 'Submitted' && d.file_path
  );
  const transcriptDoc = generalDocs.find(
    (d) => d.name === DOC_TYPE_TRANSCRIPT && d.status === 'Submitted' && d.file_path
  );
  const supportingDocs = generalDocs.filter(
    (d) => d.name === DOC_TYPE_SUPPORTING && d.status === 'Submitted' && d.file_path
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="flex-1">
        <Header />

        <div className="mx-auto max-w-4xl p-4 sm:p-8">
          {/* Page header */}
          <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400">
                Your study-abroad profile
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 mt-1">Profile</h1>
              <p className="text-gray-500 mt-1">
                Your details, preferences and documents.
              </p>
            </div>

            {!isEditing ? (
              <button
                onClick={startEditing}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
              >
                <PencilLine className="h-4 w-4" />
                Edit Profile
              </button>
            ) : (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  Cancel
                </button>
                <button
                  type="submit"
                  form="profile-form"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" /> Save Profile
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="mb-6 p-3.5 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-6 p-3.5 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-gray-900" />
              {success}
            </div>
          )}

          <form id="profile-form" onSubmit={handleSave} className="space-y-8">
            {/* Identity card */}
            <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-5">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={displayName}
                    className="h-16 w-16 rounded-2xl object-cover"
                  />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gray-900 text-xl font-bold text-white">
                    {initialsFor(user)}
                  </span>
                )}
                <div className="min-w-0">
                  <h2 className="text-xl font-bold tracking-tight text-gray-900 truncate">
                    {displayName}
                  </h2>
                  <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5">
                    <Mail className="h-3.5 w-3.5" /> {user?.email}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                    {location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {location}
                      </span>
                    )}
                    {user?.university && (
                      <span className="inline-flex items-center gap-1">
                        <GraduationCap className="h-3.5 w-3.5" /> {user.university}
                      </span>
                    )}
                    {user?.major && <span>{user.major}</span>}
                  </div>
                </div>
              </div>
            </section>

            {/* Personal information */}
            <SectionCard
              eyebrow="Section 01"
              title="Personal Information"
              desc="Name and contact details."
              icon={Mail}
            >
              {isEditing ? (
                <div className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="First name" id="first_name">
                      <input
                        id="first_name"
                        autoComplete="given-name"
                        value={form.first_name}
                        onChange={(e) => patch('first_name', e.target.value)}
                        className={inputClass}
                        placeholder="Ada"
                        required
                      />
                    </Field>
                    <Field label="Last name" id="last_name">
                      <input
                        id="last_name"
                        autoComplete="family-name"
                        value={form.last_name}
                        onChange={(e) => patch('last_name', e.target.value)}
                        className={inputClass}
                        placeholder="Lovelace"
                        required
                      />
                    </Field>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Email" id="email">
                      <input type="email" value={user?.email ?? ''} readOnly disabled className={inputClass} />
                    </Field>
                    <Field label="Phone number" id="phone_number">
                      <input
                        id="phone_number"
                        type="tel"
                        autoComplete="tel"
                        value={form.phone_number}
                        onChange={(e) => patch('phone_number', e.target.value)}
                        className={inputClass}
                        placeholder="+1 (555) 000-0000"
                      />
                    </Field>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Current country" id="country">
                      <input
                        id="country"
                        autoComplete="country-name"
                        value={form.country}
                        onChange={(e) => patch('country', e.target.value)}
                        className={inputClass}
                        placeholder="e.g. Pakistan"
                      />
                    </Field>
                    <Field label="Current city" id="city">
                      <input
                        id="city"
                        autoComplete="address-level2"
                        value={form.city}
                        onChange={(e) => patch('city', e.target.value)}
                        className={inputClass}
                        placeholder="e.g. Lahore"
                      />
                    </Field>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <ValueRow label="First name" value={user?.first_name} />
                  <ValueRow label="Last name" value={user?.last_name} />
                  <ValueRow label="Email" value={user?.email} />
                  <ValueRow label="Phone number" value={user?.phone_number} />
                  <ValueRow label="Country" value={user?.country} />
                  <ValueRow label="City" value={user?.city} />
                </div>
              )}
            </SectionCard>

            {/* Education */}
            <SectionCard
              eyebrow="Section 02"
              title="Education"
              desc="Academic background used for eligibility checks."
              icon={GraduationCap}
            >
              {isEditing ? (
                <div className="space-y-5">
                  <Field label="Highest / current education level">
                    <ChipGroup
                      options={EDUCATION_LEVELS.map((l) => ({ value: l, label: l }))}
                      values={form.education_level ? [form.education_level] : []}
                      onChange={(v) => patch('education_level', v[0] ?? '')}
                      single
                    />
                  </Field>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Field of study" id="field_of_study">
                      <input
                        id="field_of_study"
                        value={form.field_of_study}
                        onChange={(e) => patch('field_of_study', e.target.value)}
                        className={inputClass}
                        placeholder="e.g. Computer Science"
                      />
                    </Field>
                    <Field label="University" id="university">
                      <input
                        id="university"
                        value={form.university}
                        onChange={(e) => patch('university', e.target.value)}
                        className={inputClass}
                        placeholder="Current or last university"
                      />
                    </Field>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-3">
                    <Field label="Graduation year" id="graduation_year">
                      <select
                        id="graduation_year"
                        value={form.graduation_year}
                        onChange={(e) => patch('graduation_year', e.target.value)}
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
                    <Field label="GPA / CGPA" id="gpa">
                      <input
                        id="gpa"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={form.gpa}
                        onChange={(e) => patch('gpa', e.target.value)}
                        className={inputClass}
                        placeholder="3.6"
                      />
                    </Field>
                    <Field label="GPA scale" id="gpa_scale">
                      <select
                        id="gpa_scale"
                        value={form.gpa_scale}
                        onChange={(e) => patch('gpa_scale', e.target.value)}
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
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <ValueRow label="Education level" value={user?.education_level} />
                  <ValueRow label="Field of study" value={user?.major} />
                  <ValueRow label="University" value={user?.university} />
                  <ValueRow label="Graduation year" value={user?.graduation_year?.toString()} />
                  <ValueRow
                    label="GPA"
                    value={
                      user?.gpa != null
                        ? `${user.gpa}${user.gpa_scale ? ` / ${user.gpa_scale}` : ''}`
                        : null
                    }
                  />
                </div>
              )}
            </SectionCard>

            {/* Scholarship preferences */}
            <SectionCard
              eyebrow="Section 03"
              title="Scholarship Preferences"
              desc="Defaults your matches are filtered through."
              icon={SlidersHorizontal}
            >
              {prefsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                </div>
              ) : isEditing ? (
                <div className="space-y-6">
                  <Field label="What are you interested in?">
                    <ChipGroup
                      options={INTEREST_OPTIONS}
                      values={prefs.interests}
                      onChange={(v) => patchPrefs('interests', v)}
                      variant="card"
                    />
                  </Field>

                  <Field label="Funding preference">
                    <ChipGroup
                      options={FUNDING_OPTIONS}
                      values={prefs.funding_preferences}
                      onChange={(v) => patchPrefs('funding_preferences', v)}
                      variant="card"
                    />
                  </Field>

                  <Field label="Preferred study destinations">
                    <ChipGroup
                      options={DESTINATIONS.map((d) => ({ value: d, label: d }))}
                      values={prefs.destinations}
                      onChange={(v) => patchPrefs('destinations', v)}
                    />
                  </Field>

                  <Field label="Degree level">
                    <ChipGroup
                      options={DEGREE_LEVELS.map((l) => ({ value: l, label: l }))}
                      values={prefs.degree_levels}
                      onChange={(v) => patchPrefs('degree_levels', v)}
                    />
                  </Field>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Preferred field for study abroad" id="preferred_field">
                      <input
                        id="preferred_field"
                        value={prefs.preferred_field}
                        onChange={(e) => patchPrefs('preferred_field', e.target.value)}
                        className={inputClass}
                        placeholder="e.g. Data Science"
                      />
                    </Field>
                    <Field label="IELTS / English proficiency">
                      <ChipGroup
                        options={IELT_STATUSES}
                        values={prefs.ielts_status ? [prefs.ielts_status] : []}
                        onChange={(v) => patchPrefs('ielts_status', v[0] ?? '')}
                        single
                      />
                    </Field>
                  </div>

                  {prefs.ielts_status === 'completed' && (
                    <Field label="Your IELTS band">
                      <ChipGroup
                        options={IELT_BANDS.map((b) => ({ value: b, label: b }))}
                        values={prefs.ielts_band ? [prefs.ielts_band] : []}
                        onChange={(v) => patchPrefs('ielts_band', v[0] ?? '')}
                        single
                      />
                    </Field>
                  )}

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Budget / tuition preference">
                      <ChipGroup
                        options={TUITION_PREFERENCES}
                        values={prefs.tuition_preference ? [prefs.tuition_preference] : []}
                        onChange={(v) => patchPrefs('tuition_preference', v[0] ?? '')}
                        single
                      />
                    </Field>
                    <Field label="Preferred intake">
                      <ChipGroup
                        options={[
                          ...INTAKES.map((i) => ({ value: i, label: i })),
                          { value: 'Anytime', label: 'Anytime' },
                        ]}
                        values={prefs.preferred_intake}
                        onChange={(v) => patchPrefs('preferred_intake', v)}
                      />
                    </Field>
                  </div>

                  {showBudget && (
                    <Field
                      label="Maximum tuition budget (USD / year)"
                      id="max_tuition_budget"
                    >
                      <input
                        id="max_tuition_budget"
                        type="number"
                        inputMode="numeric"
                        value={prefs.max_tuition_budget}
                        onChange={(e) => patchPrefs('max_tuition_budget', e.target.value)}
                        className={inputClass}
                        placeholder="15000"
                      />
                    </Field>
                  )}

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Need application fee waivers?">
                      <ChipGroup
                        options={[
                          { value: 'yes', label: 'Yes' },
                          { value: 'no', label: 'No' },
                        ]}
                        values={[prefs.needs_application_fee_waiver ? 'yes' : 'no']}
                        onChange={(v) => patchPrefs('needs_application_fee_waiver', v[0] === 'yes')}
                        single
                      />
                    </Field>
                    <Field label="Open to studying in multiple countries?">
                      <ChipGroup
                        options={[
                          { value: 'yes', label: 'Yes' },
                          { value: 'no', label: 'No' },
                        ]}
                        values={[prefs.open_to_multiple_countries ? 'yes' : 'no']}
                        onChange={(v) => patchPrefs('open_to_multiple_countries', v[0] === 'yes')}
                        single
                      />
                    </Field>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap gap-1.5">
                    {prefs.interests.map((i) => (
                      <span
                        key={i}
                        className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-600"
                      >
                        {i}
                      </span>
                    ))}
                    {prefs.funding_preferences.map((f) => (
                      <span
                        key={f}
                        className="rounded-full border border-gray-900 bg-gray-900 px-2.5 py-1 text-[11px] font-medium text-white"
                      >
                        {f}
                      </span>
                    ))}
                    {prefs.destinations.map((d) => (
                      <span
                        key={d}
                        className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-600"
                      >
                        {d}
                      </span>
                    ))}
                    {prefs.degree_levels.map((d) => (
                      <span
                        key={d}
                        className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-600"
                      >
                        {d}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <ValueRow label="Preferred field" value={prefs.preferred_field} />
                    <ValueRow label="Tuition preference" value={prefs.tuition_preference} />
                    <ValueRow
                      label="Max tuition budget"
                      value={prefs.max_tuition_budget !== '' ? `$${prefs.max_tuition_budget}` : null}
                    />
                    <ValueRow
                      label="IELTS status"
                      value={
                        prefs.ielts_status
                          ? prefs.ielts_band
                            ? `${prefs.ielts_status} · ${prefs.ielts_band}`
                            : prefs.ielts_status
                          : null
                      }
                    />
                    <ValueRow label="Preferred intake" value={prefs.preferred_intake.join(', ')} />
                    <ValueRow
                      label="Application fee waivers"
                      value={prefs.needs_application_fee_waiver ? 'Yes' : 'No'}
                    />
                  </div>
                </div>
              )}
            </SectionCard>
          </form>

          {/* Documents */}
          <div className="mt-12">
            <div className="mb-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400">
                Attachments
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900 mt-1">
                Documents
              </h2>
              <p className="text-gray-500 mt-1">Core files used across your applications.</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
              {/* CV / Resume */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 border border-gray-200">
                  <FileText className="h-5 w-5 text-gray-500" />
                </span>

                {cvDoc ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => handleViewDocument(cvDoc)}
                        className="block max-w-full truncate text-sm font-medium text-gray-900 hover:underline"
                        title="Open document"
                      >
                        {documentFileName(cvDoc)}
                      </button>
                      <p className="mt-0.5 text-xs text-gray-400">CV / Resume</p>
                    </div>
                    <DocumentStatusBadge status={cvDoc.status} />
                    <DocumentManageActions
                      doc={cvDoc}
                      replacing={replacingDoc === cvDoc.id}
                      onView={handleViewDocument}
                      onReplace={handleReplaceDocument}
                      onDelete={handleRemoveDocument}
                    />
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">CV / Resume</p>
                      <p className="mt-0.5 text-xs text-gray-400">Not uploaded yet</p>
                    </div>
                    <UploadTrigger
                      label="Upload CV / Resume"
                      uploading={uploadingDoc === DOC_TYPE_CV}
                      onUpload={(e) => handleFileUpload(e, DOC_TYPE_CV)}
                    />
                  </>
                )}
              </div>

              {/* Transcript */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 border border-gray-200">
                  <FileText className="h-5 w-5 text-gray-500" />
                </span>

                {transcriptDoc ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <button
                        onClick={() => handleViewDocument(transcriptDoc)}
                        className="block max-w-full truncate text-sm font-medium text-gray-900 hover:underline"
                        title="Open document"
                      >
                        {documentFileName(transcriptDoc)}
                      </button>
                      <p className="mt-0.5 text-xs text-gray-400">Transcript</p>
                    </div>
                    <DocumentStatusBadge status={transcriptDoc.status} />
                    <DocumentManageActions
                      doc={transcriptDoc}
                      replacing={replacingDoc === transcriptDoc.id}
                      onView={handleViewDocument}
                      onReplace={handleReplaceDocument}
                      onDelete={handleRemoveDocument}
                    />
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">Transcript</p>
                      <p className="mt-0.5 text-xs text-gray-400">Not uploaded yet</p>
                    </div>
                    <UploadTrigger
                      label="Upload Transcript"
                      uploading={uploadingDoc === DOC_TYPE_TRANSCRIPT}
                      onUpload={(e) => handleFileUpload(e, DOC_TYPE_TRANSCRIPT)}
                    />
                  </>
                )}
              </div>

              {/* Supporting documents */}
              <div className="p-4 sm:p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Supporting Documents</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      Letters, certificates and additional files
                    </p>
                  </div>
                  <UploadTrigger
                    label="Add Supporting Document"
                    uploading={uploadingDoc === DOC_TYPE_SUPPORTING}
                    onUpload={(e) => handleFileUpload(e, DOC_TYPE_SUPPORTING)}
                  />
                </div>

                {supportingDocs.length === 0 ? (
                  <p className="text-sm text-gray-400">No supporting documents uploaded yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {supportingDocs.map((doc) => (
                      <li
                        key={doc.id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-gray-200 bg-gray-50/60 p-4"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white">
                          <FileText className="h-5 w-5 text-gray-500" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => handleViewDocument(doc)}
                            className="block w-full truncate text-left text-sm font-medium text-gray-900 hover:underline"
                            title="Open document"
                          >
                            {documentFileName(doc)}
                          </button>
                          <p className="mt-0.5 text-xs text-gray-400">
                            {documentExt(doc).toUpperCase()} file
                          </p>
                        </div>
                        <DocumentStatusBadge status={doc.status} />
                        <DocumentManageActions
                          doc={doc}
                          replacing={replacingDoc === doc.id}
                          onView={handleViewDocument}
                          onReplace={handleReplaceDocument}
                          onDelete={handleRemoveDocument}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}