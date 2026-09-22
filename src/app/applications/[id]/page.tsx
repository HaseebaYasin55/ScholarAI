"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Header from "@/components/Header";
import { useRequireOnboarding } from "@/hooks/useRequireOnboarding";
import { useAppStore } from "@/store/appStore";
import ApplicationJourney from "@/features/application-tracking/ApplicationJourney";

/**
 * Application Preparation Journey — opened from My Applications →
 * "Continue application". One journey per tracked application; every change is
 * persisted against that application's row (and its documents/SOPs).
 */
export default function ApplicationJourneyPage() {
  const { id } = useParams<{ id: string }>();
  const { ready } = useRequireOnboarding();
  const { applications } = useAppStore();

  const application = applications.find((a) => a.id === id);

  // The store is populated app-wide shortly after auth; after a short settle
  // window, a missing id is treated as not found (hand-typed URL). The timer is
  // cancelled the moment the application appears, so there is no state churn.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!ready || application) return;
    const t = setTimeout(() => setSettled(true), 1500);
    return () => clearTimeout(t);
  }, [ready, application]);

  if (!ready || (ready && !application && !settled)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-300 border-t-primary" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="mx-auto max-w-3xl px-6 py-16">
          <Link
            href="/applications"
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" /> My Applications
          </Link>
          <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-10 text-center">
            <p className="text-sm font-semibold text-gray-900">
              Application not found
            </p>
            <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-gray-500">
              This tracked application doesn&apos;t exist for your account, or
              it may have been removed.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/applications"
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" /> My Applications
          </Link>
          <Link
            href="/dashboard"
            className="text-sm font-medium text-gray-500 hover:text-gray-900"
          >
            Dashboard
          </Link>
        </div>
        <ApplicationJourney application={application} />
      </main>
    </div>
  );
}