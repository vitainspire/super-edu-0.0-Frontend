"use client";

import { useState, useEffect } from "react";

export function SchoolNameDisplay() {
  const [label, setLabel] = useState("EduScanner");

  useEffect(() => {
    const school = localStorage.getItem("scanner_school_name");
    if (school) setLabel(school);
  }, []);

  return (
    <span className="text-base font-bold text-white tracking-tight truncate max-w-[180px]">
      {label}
    </span>
  );
}
