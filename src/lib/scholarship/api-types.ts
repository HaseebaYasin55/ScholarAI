// ─── Shared type-only contract for the scholarship search API ────────────────
// Pure types — safe to import from client code (erased at compile time).

export interface SearchMeta {
  query: string;
  webQuery: string;
  searchedAt: string;
  sourceCount: number;
  fetched: number;
  extracted: number;
  errors: string[];
  fromCache: boolean;
}

export interface ScholarshipSearchResponse {
  results: import("./types").Scholarship[];
  meta: SearchMeta;
}