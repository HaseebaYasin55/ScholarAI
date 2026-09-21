/**
 * Shared document helpers: requirement ↔ user-document matching and file
 * validation. Reused by the My Applications cards and the per-application
 * preparation journey so readiness is computed the same way everywhere.
 */
import type { Document } from "@/store/appStore";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const SYNONYMS: Record<string, string[]> = {
  cv: ["resume", "curriculum", "curriculum vitae"],
  resume: ["cv", "curriculum", "curriculum vitae"],
  transcript: ["academic transcript", "mark sheet", "marksheet", "grade", "records"],
  "statement of purpose": ["sop", "personal statement", "motivation letter", "essay"],
  "motivation letter": ["sop", "statement of purpose", "personal statement", "essay"],
  recommendation: ["reference", "letter of recommendation", "lor"],
  "reference": ["recommendation", "letter of recommendation", "lor"],
  toefl: ["ielts", "english", "english proficiency", "language"],
  ielts: ["toefl", "english", "english proficiency", "language"],
  passport: ["identification", "id", "photo", "photograph"],
  "degree certificate": ["degree", "diploma", "graduation", "certificate"],
  "work experience": ["employment", "job", "employer certificate"],
  "research proposal": ["proposal", "research"],
  "portfolio": ["creative portfolio"],
  "funding declaration": ["funding", "finance", "financial", "bank", "bank statement"],
};

/**
 * Best-effort match between a user document and an officially required
 * document name. Conservative: a matched document is only ever reported as
 * "ready" by callers that ALSO check it is actually uploaded (submitted +
 * file_path present).
 */
export function docMeets(doc: Pick<Document, "name">, required: string): boolean {
  const a = normalize(doc.name);
  const b = normalize(required);
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const synA = SYNONYMS[a] ?? [];
  const synB = SYNONYMS[b] ?? [];
  if (synA.includes(b) || synB.includes(a)) return true;
  return synA.some((s) => s === b) || synB.some((s) => s === a);
}

/** The set of document record scopes a single application reads. */
export function documentsForApplication(
  documents: Document[],
  application: { university: string },
): Document[] {
  return documents.filter(
    (d) => d.university === "General" || d.university === application.university,
  );
}

/**
 * Whether a required document is genuinely ready for the user: a real uploaded
 * document (Submitted + file_path) whose name matches the requirement. Nothing
 * is treated as proof of a document unless it was actually uploaded.
 */
export function isDocumentReady(
  documents: Document[],
  required: string,
  application: { university: string },
): boolean {
  return documentsForApplication(documents, application).some(
    (d) => d.status === "Submitted" && d.file_path && docMeets(d, required),
  );
}

export function validateDocumentFile(file: File): string | null {
  const allowedExtensions = ["pdf", "doc", "docx"];
  const fileExt = file.name.split(".").pop()?.toLowerCase();
  if (!fileExt || !allowedExtensions.includes(fileExt)) {
    return "Invalid file format. Please upload PDF, DOC, or DOCX.";
  }
  if (file.size > 5 * 1024 * 1024) {
    return "File size exceeds the 5MB limit.";
  }
  return null;
}