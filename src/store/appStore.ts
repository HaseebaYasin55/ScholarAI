import { create } from 'zustand';
import { supabase } from '@/lib/supabase-browser';
import { useAuthStore } from './authStore';

const DOCUMENT_MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

// Keep the user's original filename readable in the storage object name so the
// UI can display *which* file was uploaded, without a schema change. A short
// random suffix guarantees uniqueness for replace operations.
function storageFileName(file: File): string {
  const fileExt = (file.name.split('.').pop() || '').toLowerCase();
  const stem = (file.name.replace(/\.[^.]+$/, '') || 'document').replace(/[^a-zA-Z0-9_-]+/g, '-');
  return `${stem}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
}

export const APPLICATION_STATUSES = [
  "Interested",
  "Preparing",
  "Applied",
  "Under Review",
  "Interview",
  "Accepted",
  "Rejected",
  "Draft",
  "In Review",
  "Submitted",
  "Action Required",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface Application {
  id: string;
  user_id?: string;
  university: string;
  program: string;
  status: ApplicationStatus;
  progress: number;
  deadline: string | null;
  last_updated?: string;
  // Snapshot of the scholarship chosen with "I want to apply".
  scholarship_id?: string | null;
  organization?: string | null;
  country?: string | null;
  official_url?: string | null;
  degree_levels?: string[];
  fields?: string[];
  required_documents?: string[];
  description?: string | null;
  application_info?: string | null;
  opening_date?: string | null;
  // Application preparation journey state (migration 014).
  requirements_reviewed?: boolean;
}

export interface Document {
  id: string;
  name: string;
  university: string;
  status: 'Missing' | 'Pending' | 'Submitted';
  deadline: string;
  description: string;
  file_path?: string;
}

export interface Deadline {
  id: string;
  title: string;
  entity: string;
  type: 'University' | 'Document';
  date: string;
  status: 'Upcoming' | 'Past' | 'Completed';
  urgency: 'High' | 'Medium' | 'Low';
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'deadline' | 'document' | 'status' | 'system';
  timestamp: string;
  is_read: boolean;
  priority: 'low' | 'medium' | 'high';
}

export interface Claim {
  id: string;
  user_id: string;
  application_id: string | null;
  claim_text: string;
  analysis: string;
  strength_score: number;
  status: 'Strong' | 'Needs Evidence' | 'Weak' | 'Contradictory';
  suggestions: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface SOP {
  id: string;
  user_id: string;
  application_id: string | null;
  university: string;
  program: string;
  content: string;
  created_at: string;
  updated_at: string;
}

interface AppState {
  applications: Application[];
  documents: Document[];
  deadlines: Deadline[];
  notifications: AppNotification[];
  sops: SOP[];
  claims: Claim[];
  isLoading: boolean;

  // Async Actions
  fetchData: () => Promise<void>;

  // Applications
  addApplication: (app: Omit<Application, 'id'>) => Promise<void>;
  updateApplication: (id: string, updates: Partial<Application>) => Promise<void>;
  deleteApplication: (id: string) => Promise<void>;

  // Documents
  addDocument: (doc: Omit<Document, 'id'>) => Promise<string>;
  updateDocument: (id: string, updates: Partial<Document>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  uploadDocumentFile: (id: string, file: File) => Promise<void>;
  replaceDocumentFile: (id: string, file: File, oldFilePath?: string) => Promise<void>;

  // Deadlines
  addDeadline: (deadline: Omit<Deadline, 'id'>) => Promise<void>;
  updateDeadline: (id: string, updates: Partial<Deadline>) => Promise<void>;

  // Notifications
  markNotificationAsRead: (id: string) => Promise<void>;
  markAllNotificationsAsRead: () => Promise<void>;

  // SOPs
  saveSOP: (sop: Omit<SOP, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateSOP: (id: string, updates: Partial<SOP>) => Promise<void>;
  deleteSOP: (id: string) => Promise<void>;

  // Claims
  saveClaim: (claim: Omit<Claim, 'id'>) => Promise<void>;
  deleteClaim: (id: string) => Promise<void>;
}

// Keeps `applications` an ordered list without state-level duplicates when the
// same row returns through different paths (fresh insert vs. duplicate fetch).
function prependUniqueApplication(
  list: Application[],
  app: Application,
): Application[] {
  return list.some((x) => x.id === app.id) ? list : [app, ...list];
}

// The DB enforces one application per (user, scholarship) via the partial
// unique index `applications_user_scholarship_unique`. Surfacing that as an
// error would be wrong UX — "already tracked" is a success, not a failure.
function isAlreadyTrackedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown; details?: unknown };
  if (e.code !== "23505") return false;
  const haystack = [e.message, e.details].filter(Boolean).join(" ");
  return haystack.includes("applications_user_scholarship_unique");
}

export const useAppStore = create<AppState>((set) => ({
  applications: [],
  documents: [],
  deadlines: [],
  notifications: [],
  sops: [],
  claims: [],
  isLoading: false,

  fetchData: async () => {
    set({ isLoading: true });
    const user = useAuthStore.getState().user;
    if (!user) {
      set({ isLoading: false });
      return;
    }

    try {
      const [apps, docs, deads, notes, sops, claims] = await Promise.all([
        supabase.from('applications').select('*').order('created_at', { ascending: false }),
        supabase.from('documents').select('*').order('created_at', { ascending: false }),
        supabase.from('deadlines').select('*').order('date', { ascending: true }),
        supabase.from('notifications').select('*').order('timestamp', { ascending: false }),
        supabase.from('sops').select('*').order('created_at', { ascending: false }),
        supabase.from('claims').select('*').order('created_at', { ascending: false }),
      ]);

      set({
        applications: apps.data || [],
        documents: docs.data || [],
        deadlines: deads.data || [],
        notifications: notes.data || [],
        sops: sops.data || [],
        claims: claims.data || [],
        isLoading: false
      });
    } catch (error) {
      console.error('Error fetching data from Supabase:', error);
      set({ isLoading: false });
    }
  },

  addApplication: async (app) => {
    const user = useAuthStore.getState().user;
    if (!user) {
      throw new Error("You must be signed in to track scholarships.");
    }

    // The `deadline` column is a DATE — an empty string would fail the cast
    // (SQLSTATE 22P02), so a missing deadline is stored as NULL (same pattern
    // as addDocument below).
    const payload = {
      ...app,
      user_id: user.id,
      deadline: app.deadline || null,
    };

    const { data, error } = await supabase
      .from('applications')
      .insert([payload])
      .select()
      .single();

    if (error) {
      // Already tracked: the in-memory guard can miss it (store not loaded
      // yet, rapid double-click), but the DB unique index cannot. Fetch and
      // show the existing application instead of failing the user.
      if (isAlreadyTrackedError(error)) {
        const existing = await supabase
          .from('applications')
          .select('*')
          .eq('user_id', user.id)
          .eq('scholarship_id', payload.scholarship_id ?? '')
          .maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) {
          set((state) => ({
            applications: prependUniqueApplication(state.applications, existing.data),
          }));
          return;
        }
      }
      // Surfaces the real Supabase error (PostgREST/Postgres) to the caller —
      // thrown as-is so the UI never shows a generic, misleading message.
      throw error;
    }

    set((state) => ({
      applications: prependUniqueApplication(state.applications, data),
    }));
  },

  updateApplication: async (id, updates) => {
    // Same DATE cast guard as addApplication: an empty deadline string is
    // stored as NULL rather than rejected by Postgres.
    const { deadline, ...rest } = updates;
    const sanitized: Partial<Application> = {
      ...rest,
      ...(deadline !== undefined ? { deadline: deadline || null } : {}),
    };
    const { error } = await supabase
      .from('applications')
      .update(sanitized)
      .eq('id', id);

    if (error) throw error;
    set((state) => ({
      applications: state.applications.map(app => app.id === id ? { ...app, ...sanitized } : app)
    }));
  },

  deleteApplication: async (id) => {
    const { error } = await supabase
      .from('applications')
      .delete()
      .eq('id', id);

    if (error) throw error;
    set((state) => ({
      applications: state.applications.filter(app => app.id !== id)
    }));
  },

  addDocument: async (doc): Promise<string> => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('documents')
      .insert([{ ...doc, user_id: user.id, deadline: doc.deadline || null }])
      .select()
      .single();

    if (error) throw error;
    set((state) => ({ documents: [data, ...state.documents] }));
    return data.id;
  },

  updateDocument: async (id, updates) => {
    const { error } = await supabase
      .from('documents')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    set((state) => ({
      documents: state.documents.map(doc => doc.id === id ? { ...doc, ...updates } : doc)
    }));
  },

  deleteDocument: async (id) => {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (error) throw error;
    set((state) => ({
      documents: state.documents.filter(doc => doc.id !== id)
    }));
  },

  uploadDocumentFile: async (id, file) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('User not authenticated');

    const fileExt = (file.name.split('.').pop() || '').toLowerCase();
    const contentType =
      DOCUMENT_MIME_TYPES[fileExt] || file.type || 'application/octet-stream';
    const fileName = storageFileName(file);
    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file, { contentType, cacheControl: '3600', upsert: false });

    if (uploadError) throw uploadError;

    const { error: updateError } = await supabase
      .from('documents')
      .update({ status: 'Submitted', file_path: filePath })
      .eq('id', id);

    if (updateError) {
      // Don't leave an untracked object behind if the metadata write fails.
      await supabase.storage.from('documents').remove([filePath]);
      throw updateError;
    }

set((state) => ({
      documents: state.documents.map(doc => doc.id === id ? { ...doc, status: 'Submitted', file_path: filePath } : doc)
    }));
  },

  replaceDocumentFile: async (id, file, oldFilePath) => {
    const user = useAuthStore.getState().user;
    if (!user) throw new Error('User not authenticated');

    const fileExt = (file.name.split('.').pop() || '').toLowerCase();
    const contentType =
      DOCUMENT_MIME_TYPES[fileExt] || file.type || 'application/octet-stream';
    const fileName = storageFileName(file);
    const filePath = `${user.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, file, { contentType, cacheControl: '3600', upsert: false });

    if (uploadError) throw uploadError;

    const { error: updateError } = await supabase
      .from('documents')
      .update({ status: 'Submitted', file_path: filePath })
      .eq('id', id);

    if (updateError) {
      // New file is untracked; clean it up so it isn't orphaned. The old
      // file and metadata are untouched, so the existing document survives.
      await supabase.storage.from('documents').remove([filePath]);
      throw updateError;
    }

    set((state) => ({
      documents: state.documents.map(doc => doc.id === id ? { ...doc, status: 'Submitted', file_path: filePath } : doc)
    }));

    // Only now is the old object safe to remove: the new file is stored AND
    // the row points at it. A failure to delete the old object is non-fatal
    // (it just leaves an orphaned object), so we log rather than throw.
    if (oldFilePath && oldFilePath !== filePath) {
      const { error: removeOldError } = await supabase.storage
        .from('documents')
        .remove([oldFilePath]);
      if (removeOldError) {
        console.error('[replaceDocumentFile] Could not remove the old file:', removeOldError);
      }
    }
  },

  addDeadline: async (deadline) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data, error } = await supabase
      .from('deadlines')
      .insert([{ ...deadline, user_id: user.id }])
      .select()
      .single();

    if (error) throw error;
    set((state) => ({ deadlines: [...state.deadlines, data] }));
  },

  updateDeadline: async (id, updates) => {
    const { error } = await supabase
      .from('deadlines')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    set((state) => ({
      deadlines: state.deadlines.map(d => d.id === id ? { ...d, ...updates } : d)
    }));
  },

  markNotificationAsRead: async (id) => {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (error) throw error;
    set((state) => ({
      notifications: state.notifications.map(n => n.id === id ? { ...n, is_read: true } : n)
    }));
  },

  markAllNotificationsAsRead: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id);

    if (error) throw error;
    set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, is_read: true }))
    }));
  },

  saveSOP: async (sop) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data, error } = await supabase
      .from('sops')
      .insert([{ ...sop, user_id: user.id }])
      .select()
      .single();

    if (error) throw error;
    set((state) => ({ sops: [data, ...state.sops] }));
  },

  updateSOP: async (id, updates) => {
    const { error } = await supabase
      .from('sops')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    set((state) => ({
      sops: state.sops.map(sop => sop.id === id ? { ...sop, ...updates } : sop)
    }));
  },

  deleteSOP: async (id) => {
    const { error } = await supabase
      .from('sops')
      .delete()
      .eq('id', id);

    if (error) throw error;
    set((state) => ({
      sops: state.sops.filter(sop => sop.id !== id)
    }));
  },

  saveClaim: async (claim) => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    const { data, error } = await supabase
      .from('claims')
      .insert([{ ...claim, user_id: user.id }])
      .select()
      .single();

    if (error) throw error;
    set((state) => ({ claims: [data, ...state.claims] }));
  },

  deleteClaim: async (id) => {
    const { error } = await supabase
      .from('claims')
      .delete()
      .eq('id', id);

    if (error) throw error;
    set((state) => ({
      claims: state.claims.filter(claim => claim.id !== id)
    }));
  },
}));
