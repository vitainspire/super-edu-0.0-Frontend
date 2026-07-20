"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertCircle, CheckCircle2, Save } from "lucide-react";
import { Spinner } from "@/components/scanner/spinner";
import { BreadcrumbBar } from "@/components/scanner/breadcrumb-bar";
import { ReviewFlag } from "@/components/scanner/review-flag";
import { cn } from "@/lib/utils";

interface Student { id: string; name: string; roll_number: number; }
interface ScanResult {
  matchedStudent: Student | null; score: number | null; students: Student[]; totalMarks: number; imageUrl?: string; driveUrl?: string;
  needsReview?: boolean; reviewReason?: string | null;
}

export default function ConfirmPage() {
  const params = useParams<{ classId: string; testId: string }>();
  const router = useRouter();

  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [scoreInput, setScoreInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { classId, testId } = params;

  useEffect(() => {
    const stored = sessionStorage.getItem("scanResult");
    if (!stored) { router.replace(`/scanner/${classId}/tests/${testId}/scan`); return; }
    const result = JSON.parse(stored) as ScanResult;
    setScanResult(result);
    if (result.matchedStudent) setSelectedStudentId(result.matchedStudent.id);
    if (result.score !== null) setScoreInput(String(result.score));
  }, [classId, testId, router]);

  async function handleSave() {
    if (!selectedStudentId) { setError("Please select a student."); return; }
    const scoreNum = Number(scoreInput);
    if (scoreInput.trim() === "" || isNaN(scoreNum) || scoreNum < 0) { setError("Please enter a valid score (0 or above)."); return; }
    if (scanResult && scoreNum > scanResult.totalMarks) { setError(`Score cannot exceed total marks (${scanResult.totalMarks}).`); return; }
    setSaving(true); setError(null);
    const res = await fetch("/api/save-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: selectedStudentId, testId, score: scoreNum, totalMarks: scanResult?.totalMarks, imageUrl: scanResult?.imageUrl, driveUrl: scanResult?.driveUrl }),
    });
    if (!res.ok) { const b = (await res.json()) as { error?: string }; setError(b.error ?? "Failed to save. Please try again."); setSaving(false); return; }
    sessionStorage.removeItem("scanResult");
    router.push(`/scanner/${classId}/tests/${testId}/scan`);
    router.refresh();
  }

  if (!scanResult) return <div className="flex items-center justify-center py-20"><Spinner size="lg" /></div>;

  const { students, totalMarks, matchedStudent } = scanResult;
  const scoreNum = Number(scoreInput);
  const canSave = selectedStudentId !== "" && scoreInput.trim() !== "" && !isNaN(scoreNum) && scoreNum >= 0 && scoreNum <= totalMarks;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-2 -ml-1">
        <Link href={`/scanner/${classId}/tests/${testId}/scan/camera`} className="min-h-[48px] w-[48px] flex items-center justify-center rounded-xl text-gray-600 active:scale-95 transition-transform shrink-0">
          <ArrowLeft size={24} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900">Confirm Result</h1>
          <BreadcrumbBar />
        </div>
      </div>

      {matchedStudent ? (
        <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-2xl px-5 py-4">
          <CheckCircle2 size={24} className="text-green-600 shrink-0" />
          <div><p className="text-xs font-bold uppercase tracking-wide text-green-600">AI matched</p><p className="text-base font-bold text-gray-900 mt-0.5">{matchedStudent.name}</p></div>
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4">
          <AlertCircle size={24} className="text-amber-500 shrink-0" />
          <div><p className="text-xs font-bold uppercase tracking-wide text-amber-600">AI could not read the paper</p><p className="text-sm text-gray-500 mt-0.5">Please enter the score manually and select the student below.</p></div>
        </div>
      )}

      {scanResult.needsReview && scanResult.reviewReason && (
        <ReviewFlag reason={scanResult.reviewReason} />
      )}

      <div className="space-y-2">
        <label htmlFor="student-select" className="block text-sm font-semibold text-gray-700">Student</label>
        <div className="relative">
          <select id="student-select" value={selectedStudentId} onChange={(e) => { setSelectedStudentId(e.target.value); setError(null); }} className="w-full appearance-none px-4 py-4 pr-10 rounded-2xl border border-gray-200 text-base text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-h-[52px]">
            <option value="">— Select a student —</option>
            {students.map((s) => <option key={s.id} value={s.id}>Roll {s.roll_number} — {s.name}</option>)}
          </select>
          <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">▾</div>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="score-input" className="block text-sm font-semibold text-gray-700">Score <span className="ml-1.5 font-normal text-gray-400">out of {totalMarks}</span></label>
        <input id="score-input" type="number" inputMode="decimal" min={0} max={totalMarks} step="0.5" value={scoreInput} onChange={(e) => { setScoreInput(e.target.value); setError(null); }} placeholder="e.g. 16" className="w-full px-4 py-5 rounded-2xl border border-gray-200 text-3xl font-bold text-center text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
        {scoreInput !== "" && !isNaN(scoreNum) && (
          <p className={cn("text-center text-sm font-medium", scoreNum > totalMarks ? "text-red-500" : "text-gray-400")}>
            {scoreInput} / {totalMarks}{scoreNum > totalMarks && " — exceeds total marks"}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}

      <button onClick={handleSave} disabled={saving || !canSave} className={cn("w-full min-h-[56px] rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-3 active:scale-[0.98] transition-transform", saving || !canSave ? "bg-gray-300 cursor-not-allowed" : "bg-indigo-600 shadow-lg shadow-indigo-200")}>
        {saving ? <><Spinner size="sm" className="border-white border-t-transparent" /> Saving…</> : <><Save size={20} /> Save Score</>}
      </button>
    </div>
  );
}
