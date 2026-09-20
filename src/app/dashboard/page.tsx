"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from '@/components/Header';
import {
  BadgeCheck,
  FileText,
  ArrowRight,
} from 'lucide-react';
import DashboardStats from '@/features/dashboard/components/DashboardStats';
import ApplicationTable from '@/features/application-tracking/ApplicationTable';
import ReadinessProgress from '@/features/dashboard/components/ReadinessProgress';
import RecommendationModules from '@/features/recommendations/RecommendationModules';
import { useRequireOnboarding } from '@/hooks/useRequireOnboarding';

const QUICK_ACTIONS = [
  { href: '/scholarships', label: 'Find Scholarships', sub: 'Browse matched funding', icon: BadgeCheck },
  { href: '/sop-generator', label: 'Generate SOP', sub: 'Draft your statement', icon: FileText },
];

const GREETINGS = [
  "Keep going",
  "Your next opportunity is closer",
  "One step closer",
  "Let's make progress",
  "You've got this",
  "Your future starts here",
];

export default function DashboardPage() {
  const { ready, user } = useRequireOnboarding();
  const [greeting, setGreeting] = useState("Good to see you");

  useEffect(() => {
    queueMicrotask(() => {
      setGreeting(GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
    });
  }, []);

  if (!ready || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-300 border-t-gray-900"></div>
      </div>
    );
  }

  const firstName = user.first_name || user.full_name?.split(' ')[0] || 'there';

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="flex-1">
        <Header />

        <div className="p-8 max-w-7xl mx-auto">
          {/* Hero */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-10">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-gray-400">
                Your personalized study-abroad workspace
              </p>
              <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-gray-900 mt-2">
                {greeting}, {firstName}.
              </h1>
              <p className="text-gray-500 mt-2 max-w-xl">
                Scholarships and SOPs — everything for your applications in
                one calm place.
              </p>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-2.5 sm:flex">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 transition-all duration-200 hover:border-gray-900 hover:shadow-[0_14px_30px_-18px_rgba(0,0,0,0.4)]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
                    <action.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-gray-900">
                      {action.label}
                    </span>
                    <span className="hidden sm:block text-[11px] text-gray-400">
                      {action.sub}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {/* Feature blocks */}
          <RecommendationModules />
          <ReadinessProgress />
          <DashboardStats />

          <ApplicationTable />

          {/* Copilot strip */}
          <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
                ScholarAI copilot
              </p>
              <p className="mt-1 text-[15px] font-semibold text-gray-900">
                Need a strong statement of purpose?
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <Link
                href="/sop-generator"
                className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
              >
                Generate SOP
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}