"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera, CheckCircle2, Sparkles, ScanLine, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StudentRow {
  id: string;
  name: string;
  roll_number: number;
  score: number | null;
}

interface Props {
  classId: string;
  testId: string;
  classInfo: { grade: string; section: string; name: string };
  testInfo: { topic: string; total_marks: number };
  pendingStudents: StudentRow[];
  doneStudents: StudentRow[];
}

export function ScanProgressView({ classId, testId, classInfo, testInfo, pendingStudents, doneStudents }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  useEffect(() => {
    sessionStorage.setItem("scanContext", JSON.stringify({
      classLabel: `Grade ${classInfo.grade} · ${classInfo.section} · ${classInfo.name}`,
      testLabel: testInfo.topic,
    }));
  }, [classInfo, testInfo]);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(id);
  }, [router]);

  function goToCamera(studentId: string, studentName: string) {
    router.push(
      `/scanner/${classId}/tests/${testId}/scan/camera` +
      `?studentId=${studentId}&studentName=${encodeURIComponent(studentName)}`
    );
  }

  const total = pendingStudents.length + doneStudents.length;
  const done = doneStudents.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const allDone = total > 0 && pendingStudents.length === 0;

  const q = query.trim().toLowerCase();
  const filteredPending = q ? pendingStudents.filter(s => s.name.toLowerCase().includes(q) || String(s.roll_number).includes(q)) : pendingStudents;
  const filteredDone = q ? doneStudents.filter(s => s.name.toLowerCase().includes(q) || String(s.roll_number).includes(q)) : doneStudents;
  const noResults = q && filteredPending.length === 0 && filteredDone.length === 0;

  return (
    <div className="pb-safe">
      <div
        className="-mx-4 -mt-5 px-5 pt-5 pb-6"
        style={{ background: allDone
          ? "linear-gradient(145deg, #064e3b 0%, #065f46 50%, #047857 100%)"
          : "linear-gradient(145deg, #1e1b4b 0%, #312e81 50%, #1e3a8a 100%)"
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <Link href={`/scanner/${classId}/tests`} className="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-medium transition-colors">
            <ArrowLeft size={16} /> <span>Back</span>
          </Link>
          <Link href={`/scanner/${classId}/tests/${testId}/batch-scan`} className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-black px-3 py-2 rounded-xl transition-colors active:scale-95">
            <ScanLine size={15} /> Scan All
          </Link>
        </div>

        <p className="text-[10px] font-black tracking-[0.25em] uppercase text-indigo-300/70 mb-1">
          Grade {classInfo.grade} &middot; {classInfo.section} &middot; {classInfo.name}
        </p>
        <h1 className="text-xl font-black text-white leading-tight truncate">{testInfo.topic}</h1>
        <p className="text-xs text-white/40 mt-0.5 font-medium">{testInfo.total_marks} marks</p>

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-bold text-white">{done} of {total} scanned</p>
              {allDone && <p className="flex items-center gap-1 text-xs font-bold text-emerald-300 mt-0.5"><Sparkles size={11} />All papers scanned!</p>}
              {!allDone && total > 0 && <p className="text-xs text-white/40 mt-0.5">{pendingStudents.length} remaining</p>}
            </div>
            <span className={cn("text-4xl font-black tabular-nums", allDone ? "text-emerald-300" : "text-white")}>{pct}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full transition-all duration-700", allDone ? "bg-emerald-400" : "bg-indigo-400")} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <div className="pt-4 pb-1">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="search" inputMode="search" placeholder="Search by name or roll number…"
            value={query} onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-3 rounded-2xl bg-white border border-gray-200 text-sm font-medium text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300 transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="pt-4 space-y-6">
        {noResults && (
          <div className="flex flex-col items-center py-12 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center"><Search size={20} className="text-gray-300" /></div>
            <p className="text-sm font-semibold text-gray-400">No student found for &ldquo;{query}&rdquo;</p>
          </div>
        )}

        {filteredPending.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              <p className="text-[11px] font-black tracking-[0.2em] uppercase text-gray-400">
                Pending — {filteredPending.length}{q && filteredPending.length !== pendingStudents.length ? ` of ${pendingStudents.length}` : ""}
              </p>
            </div>
            <ul className="space-y-2">
              {filteredPending.map((s) => (
                <li key={s.id} className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 shadow-sm border border-gray-100 min-h-[64px]">
                  <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0 text-xs font-black text-gray-500 tabular-nums">
                    {String(s.roll_number).padStart(2, "0")}
                  </div>
                  <span className="text-sm font-bold text-gray-800 flex-1 min-w-0 truncate">{highlightMatch(s.name, q)}</span>
                  <button onClick={() => goToCamera(s.id, s.name)} className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-xs font-bold px-4 rounded-xl active:scale-95 transition-transform shadow-md shadow-indigo-200 min-h-[44px] shrink-0">
                    <Camera size={15} /> Scan
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {filteredDone.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <p className="text-[11px] font-black tracking-[0.2em] uppercase text-emerald-600">
                Done — {filteredDone.length}{q && filteredDone.length !== doneStudents.length ? ` of ${doneStudents.length}` : ""}
              </p>
            </div>
            <ul className="space-y-2">
              {filteredDone.map((s) => {
                const pctScore = testInfo.total_marks > 0 ? (s.score ?? 0) / testInfo.total_marks : 0;
                const scoreColor = pctScore >= 0.7 ? "text-emerald-600" : pctScore >= 0.4 ? "text-amber-600" : "text-red-500";
                return (
                  <li key={s.id} className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 border border-gray-100 min-h-[64px]">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 text-xs font-black text-emerald-600 tabular-nums">
                      {String(s.roll_number).padStart(2, "0")}
                    </div>
                    <span className="text-sm font-semibold text-gray-500 flex-1 min-w-0 truncate">{highlightMatch(s.name, q)}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn("text-sm font-black tabular-nums", scoreColor)}>
                        {s.score ?? "—"}<span className="text-gray-300 font-normal"> / {testInfo.total_marks}</span>
                      </span>
                      <CheckCircle2 size={16} className="text-emerald-400" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function highlightMatch(name: string, query: string): React.ReactNode {
  if (!query) return name;
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return name;
  return (
    <>{name.slice(0, idx)}<span className="text-indigo-600 font-black">{name.slice(idx, idx + query.length)}</span>{name.slice(idx + query.length)}</>
  );
}
