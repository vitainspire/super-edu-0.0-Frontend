"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    // Clear both session and role cookies
    document.cookie = "edu-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict";
    document.cookie = "edu-role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict";
    // Clear scanner localStorage
    ["scanner_school_id","scanner_school_name","scanner_token","scanner_class_id","scanner_class_name",
      "scanner_class_grade","scanner_class_section","scanner_teacher_id","scanner_teacher_name",
      "scanner_staff_name"].forEach(k => localStorage.removeItem(k));
    router.push("/scanner/login");
    router.refresh();
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-1.5 text-white/60 hover:text-white px-3 min-h-[44px] rounded-xl active:scale-95 transition-all"
    >
      <LogOut size={16} />
      <span className="text-sm font-medium">Logout</span>
    </button>
  );
}
