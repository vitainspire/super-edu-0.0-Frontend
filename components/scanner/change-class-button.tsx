"use client";

import { useRouter } from "next/navigation";

const SCANNER_KEYS = [
  "scanner_class_id",
  "scanner_class_name",
  "scanner_class_grade",
  "scanner_class_section",
  "scanner_teacher_id",
  "scanner_school_name",
  "scanner_teacher_name",
];

export function ChangeClassButton() {
  const router = useRouter();

  function handleChange() {
    SCANNER_KEYS.forEach((key) => localStorage.removeItem(key));
    router.push("/scanner/connect");
    router.refresh();
  }

  return (
    <button
      onClick={handleChange}
      className="min-h-[44px] px-3 text-sm font-medium text-white/60 hover:text-white active:scale-95 transition-all rounded-xl"
    >
      Change Teacher
    </button>
  );
}
