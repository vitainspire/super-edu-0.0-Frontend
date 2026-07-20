import { createServerComponentClient } from "@/lib/supabase-server";
import Link from "next/link";
import { ArrowLeft, ChevronRight, ClipboardList, FileText, ScanLine, CheckCircle2 } from "lucide-react";

interface Props { params: { classId: string }; }
interface ClassInfo { grade: string; section: string; name: string; }
interface TestRow { id: string; topic: string; total_marks: number; conducted_on: string; subject: string; term: string | null; }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function TestsPage({ params }: Props) {
  const supabase = await createServerComponentClient();
  const [classResult, testsResult, studentsResult] = await Promise.all([
    supabase.from("classes").select("grade, section, name").eq("id", params.classId).single(),
    supabase.from("tests").select("id, topic, total_marks, conducted_on, subject, term").eq("class_id", params.classId).order("conducted_on", { ascending: false }),
    supabase.from("students").select("id").eq("class_id", params.classId).eq("is_active", true),
  ]);

  if (classResult.error) throw new Error(classResult.error.message);
  if (testsResult.error) throw new Error(testsResult.error.message);

  const cls = classResult.data as ClassInfo;
  const tests = (testsResult.data ?? []) as TestRow[];
  const totalStudents = (studentsResult.data ?? []).length;

  const testIds = tests.map((t) => t.id);
  const marksResult = testIds.length > 0
    ? await supabase.from("marks").select("test_id").in("test_id", testIds)
    : { data: [] };

  const marksCountMap = new Map<string, number>();
  for (const row of (marksResult.data ?? []) as { test_id: string }[]) {
    marksCountMap.set(row.test_id, (marksCountMap.get(row.test_id) ?? 0) + 1);
  }

  return (
    <div>
      <div
        className="-mx-4 -mt-5 px-5 pt-5 pb-7"
        style={{ background: "linear-gradient(145deg, #1e1b4b 0%, #312e81 50%, #1e3a8a 100%)" }}
      >
        <Link
          href="/scanner/connect"
          className="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-sm font-medium mb-5 transition-colors"
        >
          <ArrowLeft size={16} /> <span>Back</span>
        </Link>
        <p className="text-[10px] font-black tracking-[0.25em] uppercase text-indigo-300/70 mb-1">
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
                    className={`group flex-1 flex items-center rounded-2xl px-4 py-4 shadow-sm border active:scale-[0.98] transition-all hover:shadow-md min-h-[76px] ${
                      completed ? "bg-emerald-50 border-emerald-200 hover:border-emerald-300" : "bg-white border-gray-100 hover:border-indigo-100"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mr-3 transition-colors ${
                      completed ? "bg-emerald-100" : "bg-indigo-50 group-hover:bg-indigo-100"
                    }`}>
                      {completed ? <CheckCircle2 size={18} className="text-emerald-600" /> : <FileText size={16} className="text-indigo-400" />}
                    </div>
                    <div className="min-w-0 flex-1 mr-2">
                      <p className={`text-base font-bold leading-snug truncate ${completed ? "text-emerald-800" : "text-gray-900"}`}>
                        {test.topic}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-400">{formatDate(test.conducted_on)}</span>
                        <span className="text-gray-200">·</span>
                        <span className={`text-xs font-bold rounded-md px-1.5 py-0.5 ${completed ? "text-emerald-700 bg-emerald-100" : "text-indigo-500 bg-indigo-50"}`}>
                          {test.total_marks} marks
                        </span>
                        {test.subject && (<><span className="text-gray-200">·</span><span className="text-xs text-gray-400 truncate">{test.subject}</span></>)}
                      </div>
                      {completed && (
                        <p className="text-[10px] font-black tracking-wide uppercase text-emerald-600 mt-1 flex items-center gap-1">
                          <CheckCircle2 size={11} /> All {totalStudents} scanned
                        </p>
                      )}
                      {inProgress && <p className="text-[10px] font-semibold text-indigo-500 mt-1">{scanned} of {totalStudents} scanned</p>}
                    </div>
                    <ChevronRight size={18} className={`shrink-0 transition-colors ${completed ? "text-emerald-300 group-hover:text-emerald-500" : "text-gray-300 group-hover:text-indigo-400"}`} />
                  </Link>

                  <Link
                    href={`/scanner/${params.classId}/tests/${test.id}/batch-scan`}
                    className={`shrink-0 w-[60px] rounded-2xl flex flex-col items-center justify-center gap-1 shadow-md active:scale-95 transition-transform ${
                      completed ? "bg-gradient-to-b from-emerald-500 to-emerald-600 shadow-emerald-200/60" : "bg-gradient-to-b from-indigo-600 to-indigo-700 shadow-indigo-200/60"
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
            Tap <span className="font-bold text-indigo-500">Scan</span> to scan all papers — AI reads names automatically.
            Tap the card to manage students individually.
          </p>
        )}
      </div>
    </div>
  );
}
