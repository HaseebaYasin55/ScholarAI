"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import OnboardingFlow from "@/features/onboarding/OnboardingFlow";

export default function OnboardingPage() {
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) router.replace("/auth");
    else if (user?.onboarded_at) router.replace("/dashboard");
  }, [isLoading, isAuthenticated, user?.onboarded_at, router]);

  if (isLoading || !isAuthenticated || user?.onboarded_at) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  return <OnboardingFlow />;
}