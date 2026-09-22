"use client";

import React from 'react';
import { FileText, CheckCircle, Clock } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { isCompletedStatus } from '../../application-tracking/status';

// Subtle elevation — a soft top line plus a diffuse lower shadow so the cards
// read as slightly raised without any gradient or glow.
const CARD_ELEVATION =
  'shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_26px_-20px_rgba(0,0,0,0.25)]';
const CARD_ELEVATION_HOVER =
  'hover:shadow-[0_2px_4px_rgba(0,0,0,0.05),0_18px_36px_-22px_rgba(0,0,0,0.35)]';

export default function DashboardStats() {
  const { applications } = useAppStore();

  const stats = [
    {
      label: 'Total Applications',
      value: applications.length,
      icon: FileText,
    },
    {
      label: 'Completed',
      value: applications.filter(a => isCompletedStatus(a.status)).length,
      icon: CheckCircle,
    },
    {
      label: 'In Progress',
      value: applications.filter(a => !isCompletedStatus(a.status)).length,
      icon: Clock,
    },
  ];

  return (
    <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`flex items-center gap-3.5 rounded-2xl border border-gray-200 bg-white p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-gray-300 active:translate-y-0 ${CARD_ELEVATION} ${CARD_ELEVATION_HOVER}`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-700 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <stat.icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xl font-bold leading-tight tabular-nums text-gray-900">
              {stat.value}
            </p>
            <p className="mt-0.5 truncate text-[12px] font-medium text-gray-500">
              {stat.label}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
