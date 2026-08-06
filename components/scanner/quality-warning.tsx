"use client";

import { AlertTriangle } from "lucide-react";

// A soft warning shown before grading, based on the client-side blur/lighting
// heuristic in lib/scan-capture.ts. Never blocks the flow — the heuristic can
// false-positive on a genuinely fine photo, so the scanner can always proceed anyway.
export function QualityWarning({ reason, onRetake }: { reason: string; onRetake: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl px-4 py-3 bg-amber-50 border border-amber-200">
      <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800">{reason}</p>
        <button onClick={onRetake} className="text-xs font-bold text-amber-700 underline underline-offset-2 mt-1">
          Retake photo
        </button>
      </div>
    </div>
  );
}
