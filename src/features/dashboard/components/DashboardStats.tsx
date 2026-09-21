"use client";

import React from 'react';
import { FileText, CheckCircle, Clock } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { isCompletedStatus } from '../../application-tracking/status';

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
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="mb-4">
            <span className="p-2 rounded-lg bg-gray-100 inline-flex">
              <stat.icon className="w-5 h-5 text-gray-700" />
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">{stat.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5 tabular-nums">{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
