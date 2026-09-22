// ─── Shared type-only contract for the scholarship search API ────────────────
// Pure types — safe to import from client code (erased at compile time).

/** How the server interpreted the user's search (serializable subset of the
 * full SearchIntent — safe for the client, which must never import intent.ts). */
export interface IntentInfo {
  mode: "name" | "general";
  namedScholarship: string | null;
  displayField: string | null;
  /** Related programme vocabulary — used to render "try a broader field" hints. */
  relatedFields: string[];
  country: string | null;
  degreeLevels: string[];
  funding: string | null;
}

export interface SearchMeta {
  query: string;
  webQuery: string;
  searchedAt: string;
  sourceCount: number;
  fetched: number;
  extracted: number;
  /** Pages that passed official-source verification. */
  verifiedOfficial: number;
  /** URL resolutions the official-source gate rejected (transparency only). */
  rejected: Array<{ host: string; url: string }>;
  /** How the query was understood (named scholarship vs. general field search). */
  intent: IntentInfo | null;
  errors: string[];
  fromCache: boolean;
  /**
   * True when the search could not be completed because an upstream provider
   * (web search / rate limiter) was temporarily unavailable — NOT a definitive
   * "nothing exists". The client should show a retry message rather than a
   * no-results state.
   */
  transientFailure: boolean;
}

export interface ScholarshipSearchResponse {
  results: import("./types").Scholarship[];
  meta: SearchMeta;
}