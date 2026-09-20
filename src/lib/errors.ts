interface SupabaseLikeError {
  message?: string;
  code?: string;
  status?: number;
  statusCode?: number;
  details?: string;
  hint?: string;
}

export function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as SupabaseLikeError;
    const parts: string[] = [];
    if (typeof e.message === 'string' && e.message.trim()) parts.push(e.message);
    if (typeof e.code === 'string' && e.code.trim()) parts.push(`code=${e.code}`);
    if (typeof e.status === 'number') parts.push(`status=${e.status}`);
    else if (typeof e.statusCode === 'number') parts.push(`status=${e.statusCode}`);
    if (typeof e.details === 'string' && e.details.trim()) parts.push(`details=${e.details}`);
    if (typeof e.hint === 'string' && e.hint.trim()) parts.push(`hint=${e.hint}`);
    if (parts.length > 0) return parts.join(' · ');
    if (e instanceof Error && e.message) return e.message;
  }
  if (err instanceof Error) return err.message || 'Unknown error';
  return typeof err === 'string' && err ? err : 'Unknown error';
}

export function logError(context: string, err: unknown): void {
  console.error(`[${context}]`, err);
}