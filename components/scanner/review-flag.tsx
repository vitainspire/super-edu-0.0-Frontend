"use client";

import { Eye } from "lucide-react";

// Surfaces the server-side confidence check from lib/grade-review.ts — shown
// once a score comes back, so a suspicious result (all-zero, mostly blank)
// isn't silently auto-accepted alongside a genuinely good scan.
export function ReviewFlag({ reason }: { reason: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl px-4 py-3" style={{ background: 'var(--scanner-blue-soft)', border: '2px solid var(--scanner-blue)' }}>
      <Eye size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--scanner-blue-mid)' }} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-black uppercase tracking-wide mb-0.5" style={{ color: 'var(--scanner-blue)' }}>Worth a second look</p>
        <p className="text-sm font-semibold" style={{ color: 'var(--scanner-blue)' }}>{reason}</p>
      </div>
    </div>
  );
}
