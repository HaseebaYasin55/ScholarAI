"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { Mail, Lock, ArrowRight, Check } from "lucide-react";
import { LogoMark } from "@/components/Logo";

function GoogleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

const TRUST_POINTS = [
  "Verified scholarships from official sources",
  "One calm place for documents, SOPs and deadlines",
  "Eligibility that actually matches your profile",
];

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const { signIn, signUp, signInWithOAuth, isLoading: authLoading } =
    useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'signup' || mode === 'login') {
      const timer = setTimeout(() => {
        setIsLogin(mode === 'login');
        window.history.replaceState({}, '', '/auth');
      }, 0);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const oauthError = search.get("error");
    if (oauthError) {
      const timer = setTimeout(() => {
        setError(oauthError);
        window.history.replaceState({}, "", "/auth");
      }, 0);
      return () => clearTimeout(timer);
    }
  }, []);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="animate-spin rounded-full h-11 w-11 border-2 border-gray-200 border-t-primary" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }

      router.push(useAuthStore.getState().user?.onboarded_at ? "/dashboard" : "/onboarding");
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Please try again.";

      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    try {
      setIsLoading(true);
      await signInWithOAuth("google");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
      setIsLoading(false);
    }
  };

  const inputClass =
    "w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-11 pr-4 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:border-primary focus:ring-[3px] focus:ring-primary/15 focus:outline-none";

  return (
    <div className="min-h-screen bg-surface lg:grid lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-gray-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-16 h-96 w-96 rounded-full bg-primary/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-primary/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:26px_26px]"
        />

        <div className="relative flex flex-col gap-8">
          <div className="flex items-center gap-2.5 text-white">
            <LogoMark className="h-10 w-10 rounded-xl" />
            <span className="text-xl font-bold tracking-tight">
              Scholar
              <span className="text-primary-soft">AI</span>
            </span>
          </div>

          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.28em] text-gray-400">
              Study abroad copilot
            </p>
            <h2 className="mt-4 max-w-md text-3xl font-semibold leading-tight tracking-tight text-white">
              Every deadline, document and dream —{" "}
              <span className="text-primary-soft">organized.</span>
            </h2>
          </div>
        </div>

        <ul className="relative space-y-3">
          {TRUST_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-3 text-[13px] text-gray-300">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/25 text-primary-soft">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              {point}
            </li>
          ))}
        </ul>
      </aside>

      {/* Form column */}
      <div className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <div className="mb-4 flex items-center gap-2.5">
              <LogoMark className="h-10 w-10 rounded-xl" />
              <span className="text-xl font-bold tracking-tight text-gray-900">
                Scholar
                <span className="text-primary">AI</span>
              </span>
            </div>
          </div>

          <div className="text-center">
            <div className="mb-6 hidden items-center justify-center lg:flex">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-b from-gray-800 to-gray-900 shadow-[0_12px_24px_-14px_rgba(36,60,76,0.7)] ring-1 ring-white/10">
                <LogoMark className="h-9 w-9 rounded-xl" />
              </span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-[2.15rem]">
              {isLogin ? "Welcome back." : "Start your journey."}
            </h1>

            <p className="mt-2 text-sm text-gray-500">
              {isLogin
                ? "Sign in to pick up where you left off."
                : "Create your account — it's free and takes a minute."}
            </p>
          </div>

          <div className="card mt-8 p-7 shadow-card sm:p-8">
            {error && (
              <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className={inputClass}
                />
              </div>

              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  required
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className={inputClass}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full px-4 py-3 text-[15px]"
              >
                {isLoading ? (
                  <span className="inline-block h-5 w-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                ) : (
                  <>
                    {isLogin ? "Sign In" : "Create Account"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="my-7 flex items-center gap-4">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs font-medium uppercase tracking-widest text-gray-400">
                or
              </span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="btn-secondary w-full px-4 py-3 text-sm"
            >
              <GoogleIcon className="h-5 w-5" />
              <span>Continue with Google</span>
            </button>
          </div>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError("");
              }}
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}