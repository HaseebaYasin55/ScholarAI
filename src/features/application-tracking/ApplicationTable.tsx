"use client";

import React from 'react';
import { ExternalLink } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { displayStatus, appStatusPillClass } from './status';
import { formatLongDate } from '@/lib/scholarship/format';

export default function ApplicationTable() {
  const { applications } = useAppStore();

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-200 flex items-center justify-between">
        <h3 className="font-bold text-gray-900">Applied Scholarships</h3>
        <button className="text-sm text-gray-900 font-semibold hover:underline">View All</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wider">
              <th className="px-6 py-3 font-semibold">Scholarship & Program</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3 font-semibold">Progress</th>
              <th className="px-6 py-3 font-semibold">Deadline</th>
              <th className="px-6 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {applications.map((app) => (
              <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <p className="text-sm font-semibold text-gray-900">{app.university}</p>
                  <p className="text-xs text-gray-500">{app.program}</p>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${appStatusPillClass[app.status]}`}>
                    {displayStatus(app.status)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gray-900 rounded-full"
                        style={{ width: `${app.progress}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-600 font-medium">{app.progress}%</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{formatLongDate(app.deadline)}</td>
                <td className="px-6 py-4 text-right">
                  <button className="p-1 text-gray-400 hover:text-gray-900 transition-colors">
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}