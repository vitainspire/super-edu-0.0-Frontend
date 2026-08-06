import { backendFetchServer } from "@/lib/supabase-server";
import Link from "next/link";
import { ArrowLeft, ChevronRight, ClipboardList, FileText, ScanLine, CheckCircle2 } from "lucide-react";

interface Props { params: { classId: string }; }
interface ClassInfo { grade: string; section: string; name: string; }
interface TestRow { id: string; topic: string; total_marks: number; conducted_on: string; subject: string; term: string | null; }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function TestsPage({ params }: Props) {
  const res = await backendFetchServer(`/api/scanner/classes/${params.classId}/tests`);
  if (!res.ok) throw new Error(`Failed to load tests (${res.status})`);
  const data = (await res.json()) as {
    class: ClassInfo; tests: TestRow[]; totalStudents: number; marksCounts: Record<string, number>;
  };

  const cls = data.class;
  const tests = data.tests;
  const totalStudents = data.totalStudents;
  const marksCountMap = new Map(Object.entries(data.marksCounts));

  return (
    <div>
      <div
        className="-mx-4 -mt-5 px-5 pt-5 pb-7"
        style={{ background: "var(--scanner-blue)" }}
      >
        <Link
          href="/scanner/connect"
          className="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-medium mb-5 transition-colors"
        >
          <ArrowLeft size={16} /> <span>Back</span>
        </Link>
        <p className="text-[10px] font-black tracking-[0.25em] uppercase text-[rgba(61,108,180,0.7)] mb-1">
          Grade {cls.grade} &middot; {cls.section} &middot; {cls.name}
        </p>
        <h1 className="text-2xl font-black text-white leading-tight">Select a Test</h1>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs font-bold text-white/50 bg-white/10 rounded-full px-3 py-1">
            {tests.length} {tests.length === 1 ? "test" : "tests"}
          </span>
        </div>
      </div>

      <div className="pt-4">
        {tests.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center">
              <ClipboardList size={28} className="text-gray-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-500">No tests yet</p>
              <p className="text-xs text-gray-400 mt-0.5">Tests created by your teacher will appear here</p>
            </div>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {tests.map((test) => {
              const scanned = marksCountMap.get(test.id) ?? 0;
              const completed = totalStudents > 0 && scanned >= totalStudents;
              const inProgress = !completed && scanned > 0;

              return (
                <li key={test.id} className="flex items-stretch gap-2">
                  <Link
                    href={`/scanner/${params.classId}/tests/${test.id}/scan`}
                    className={`group flex-1 flex items-center rounded-2xl px-4 py-4 border-2 active:scale-[0.98] transition-all min-h-[76px] ${
                      completed ? "bg-emerald-50 border-emerald-200 hover:border-emerald-300" : "bg-white border-[var(--card-border)] hover:border-[var(--scanner-blue-mid)]"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mr-3 transition-colors ${
                      completed ? "bg-emerald-100" : "bg-[var(--scanner-blue-soft)] group-hover:brightness-95"
                    }`}>
                      {completed ? <CheckCircle2 size={18} className="text-emerald-600" /> : <FileText size={16} className="text-[var(--scanner-blue-mid)]" />}
                    </div>
                    <div className="min-w-0 flex-1 mr-2">
                      <p className={`text-base font-bold leading-snug truncate ${completed ? "text-emerald-800" : "text-gray-900"}`}>
                        {test.topic}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-400">{formatDate(test.conducted_on)}</span>
                        <span className="text-gray-200">·</span>
                        <span className={`text-xs font-bold rounded-md px-1.5 py-0.5 ${completed ? "text-emerald-700 bg-emerald-100" : "text-[var(--scanner-blue-mid)] bg-[var(--scanner-blue-soft)]"}`}>
                          {test.total_marks} marks
                        </span>
                        {test.subject && (<><span className="text-gray-200">·</span><span className="text-xs text-gray-400 truncate">{test.subject}</span></>)}
                      </div>
                      {completed && (
                        <p className="text-[10px] font-black tracking-wide uppercase text-emerald-600 mt-1 flex items-center gap-1">
                          <CheckCircle2 size={11} /> All {totalStudents} scanned
                        </p>
                      )}
                      {inProgress && <p className="text-[10px] font-semibold text-[var(--scanner-blue-mid)] mt-1">{scanned} of {totalStudents} scanned</p>}
                    </div>
                    <ChevronRight size={18} className={`shrink-0 transition-colors ${completed ? "text-emerald-300 group-hover:text-emerald-500" : "text-gray-300 group-hover:text-[var(--scanner-blue-mid)]"}`} />
                  </Link>

                  <Link
                    href={`/scanner/${params.classId}/tests/${test.id}/batch-scan`}
                    className={`shrink-0 w-[60px] rounded-2xl flex flex-col items-center justify-center gap-1 border-2 border-[var(--card-border)] active:scale-95 transition-transform ${
                      completed ? "bg-[#065f46]" : "bg-[var(--scanner-blue)]"
                    }`}
                  >
                    <ScanLine size={22} className="text-white" />
                    <span className="text-[9px] font-black tracking-wide text-white/80 uppercase">Scan</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {tests.length > 0 && (
          <p className="text-center text-xs text-gray-400 mt-6 px-2 leading-relaxed">
            Tap <span className="font-bold text-[var(--scanner-blue-mid)]">Scan</span> to scan all papers — AI reads names automatically.
            Tap the card to manage students individually.
          </p>
        )}
      </div>
    </div>
  );
}
