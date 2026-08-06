"use client";

import { useEffect, useState } from "react";

interface ScanContext {
  classLabel: string;
  testLabel: string;
}

export function BreadcrumbBar() {
  const [ctx, setCtx] = useState<ScanContext | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("scanContext");
    if (raw) {
      try {
        setCtx(JSON.parse(raw) as ScanContext);
      } catch {
        // corrupted data — ignore
      }
    }
  }, []);

  if (!ctx) return null;

  return (
    <p className="text-xs text-gray-400 truncate leading-none mt-0.5">
      {ctx.classLabel}&ensp;·&ensp;{ctx.testLabel}
    </p>
  );
}
