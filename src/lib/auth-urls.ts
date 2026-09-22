// Environment-aware auth redirect handling.
//
// Rules:
//  - Local development (localhost/127.0.0.1): the origin is ALWAYS the
//    browser's own origin (e.g. http://localhost:3000). A configured
//    production site URL is never forced onto a local session.
//  - Production: an explicit `NEXT_PUBLIC_SITE_URL` wins if present;
//    otherwise we fall back to the browser's actual origin so the value is
//    derived dynamically and never hardcoded (e.g. a stale Vercel deployment).

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

export function getAuthOrigin(): string {
  if (typeof window !== "undefined" && isLocalHost(window.location.hostname)) {
    return window.location.origin;
  }

  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured && configured.trim()) {
    return configured.trim().replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}

export function getAuthCallbackUrl(): string {
  const origin = getAuthOrigin();
  return origin ? `${origin}/auth/callback` : "/auth/callback";
}