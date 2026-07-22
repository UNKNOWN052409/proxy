"use client";

import { TIME_PERIODS } from "@/lib/utils/format";

/**
 * Time Period Selector Component
 * Allows users to select different time ranges for metrics
 */
export default function TimePeriodSelector({ value, onChange, className = "" }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-xs text-text-muted shrink-0">Period:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-sm text-text-main hover:border-brand-500/50 focus:outline-none focus:border-brand-500 transition-colors cursor-pointer"
      >
        {TIME_PERIODS.map((period) => (
          <option key={period.value} value={period.value}>
            {period.label}
          </option>
        ))}
      </select>
    </div>
  );
}
