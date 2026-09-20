"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

/**
 * Redirects to /auth if logged out, or /onboarding if onboarded_at is missing.
 * Returns `ready` only when the user is fully onboarded and loaded.
 */
export function useRequireOnboarding() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) router.replace("/auth");
    else if (!user?.onboarded_at) router.replace("/onboarding");
  }, [isLoading, isAuthenticated, user?.onboarded_at, router]);

  const ready = !isLoading && isAuthenticated && !!user?.onboarded_at;
  return { ready, user };
}