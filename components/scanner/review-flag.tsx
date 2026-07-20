"use client";

import { Eye } from "lucide-react";

// Surfaces the server-side confidence check from lib/grade-review.ts — shown
// once a score comes back, so a suspicious result (all-zero, mostly blank)
// isn't silently auto-accepted alongside a genuinely good scan.
export function ReviewFlag({ reason }: { reason: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl px-4 py-3 bg-indigo-50 border border-indigo-200">
      <Eye size={16} className="text-indigo-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black uppercase tracking-wide text-indigo-600 mb-0.5">Worth a second look</p>
        <p className="text-sm font-semibold text-indigo-800">{reason}</p>
      </div>
    </div>
  );
}
