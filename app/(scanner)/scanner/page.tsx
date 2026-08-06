"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/scanner/spinner";

export default function ScannerIndexPage() {
  const router = useRouter();

  useEffect(() => {
    // Connect screen handles both states: it shows the teacher's class list when
    // a teacher is connected, or the code-entry form when not.
    router.replace("/scanner/connect");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Spinner size="lg" />
    </div>
  );
}
