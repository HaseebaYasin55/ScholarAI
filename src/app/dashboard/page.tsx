"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Header from '@/components/Header';
import {
  ArrowRight,
  BadgeCheck,
  FileText,
} from 'lucide-react';
import DashboardStats from '@/features/dashboard/components/DashboardStats';
import ApplicationCards from '@/features/application-tracking/ApplicationCards';
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

// Layered elevation: a soft contact shadow plus a wider diffuse one. Buttons
// get a slightly denser shadow so they feel pressable.
const HERO_ELEVATION =
  'shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_36px_-26px_rgba(0,0,0,0.3)]';
const BTN_BLACK_ELEVATION =
  'shadow-[0_1px_2px_rgba(0,0,0,0.3),0_10px_18px_-12px_rgba(0,0,0,0.5)] hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_14px_24px_-12px_rgba(0,0,0,0.45)]';
const BTN_LIGHT_ELEVATION =
  'shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_16px_-12px_rgba(0,0,0,0.25)] hover:shadow-[0_1px_2px_rgba(0,0,0,0.06),0_12px_22px_-12px_rgba(0,0,0,0.3)]';

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

        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          {/* Hero */}
          <section
            className={`mb-8 overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 sm:p-8 ${HERO_ELEVATION}`}
          >
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-gray-400">
                  ScholarAI workspace
                </p>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                  {greeting}, {firstName}.
                </h1>
                <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-gray-500">
                  Scholarships and SOPs — everything for your applications in
                  one calm place.
                </p>
              </div>

              {/* Primary actions */}
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
                {QUICK_ACTIONS.map((action, index) => {
                  const primary = index === 0;
                  return (
                    <Link
                      key={action.href}
                      href={action.href}
                      className={`group inline-flex w-full items-center justify-center gap-2.5 rounded-2xl px-5 py-3 text-sm font-semibold transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 sm:w-auto ${
                        primary
                          ? `bg-gray-900 text-white hover:bg-gray-800 ${BTN_BLACK_ELEVATION}`
                          : `border border-gray-300 bg-white text-gray-900 hover:border-gray-900 ${BTN_LIGHT_ELEVATION}`
                      }`}
                    >
                      <action.icon className="h-4 w-4 shrink-0" />
                      <span className="whitespace-nowrap">{action.label}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" />
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Stats + applications */}
          <DashboardStats />

          <ApplicationCards />
        </div>
      </main>
    </div>
  );
}
