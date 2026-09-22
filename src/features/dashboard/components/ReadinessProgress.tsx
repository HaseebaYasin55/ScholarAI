"use client";

import React from 'react';
import { Target } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

export default function ReadinessProgress() {
  const { applications, documents } = useAppStore();

  const totalApps = applications.length;
  const completedApps = applications.filter(a => a.status === 'Submitted').length;
  const readinessPercentage = totalApps > 0 ? Math.round((completedApps / totalApps) * 100) : 0;

  const totalDocs = documents.length;
  const submittedDocs = documents.filter(d => d.status === 'Submitted').length;

  return (
    <div className="card p-6 mb-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="font-bold text-gray-900">Application Readiness</h3>
          <p className="text-sm text-gray-500">Overall progress across all your targets</p>
        </div>
        <div className="bg-primary-tint border border-primary/20 p-2 rounded-lg">
          <Target className="w-6 h-6 text-primary-ink" />
        </div>
      </div>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="relative h-32 w-32 shrink-0">
          <svg className="w-full h-full" viewBox="0 0 100 100">
            <circle
              className="text-gray-100 stroke-current"
              strokeWidth="10"
              fill="transparent"
              r="40"
              cx="50"
              cy="50"
            />
            <circle
              className="text-primary-deep stroke-current"
              strokeWidth="10"
              strokeDasharray="251.2"
              strokeDashoffset={251.2 - (251.2 * readinessPercentage) / 100}
              strokeLinecap="round"
              fill="transparent"
              r="40"
              cx="50"
              cy="50"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-gray-900">{readinessPercentage}%</span>
            <span className="text-[10px] font-medium text-gray-400 uppercase">Ready</span>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3 rounded-xl bg-primary-tint/40 border border-primary/15">
            <p className="text-xs text-gray-500 mb-1">Applications</p>
            <p className="text-sm font-semibold text-primary-ink">{completedApps}/{totalApps} Submitted</p>
          </div>
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Documents</p>
            <p className="text-sm font-semibold text-gray-900">{submittedDocs}/{totalDocs} Uploaded</p>
          </div>
          <div className="p-3 rounded-xl bg-gray-50 border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Profile</p>
            <p className="text-sm font-semibold text-gray-900">Complete</p>
          </div>
        </div>
      </div>
    </div>
  );
}
