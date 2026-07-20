"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera, RefreshCw, CheckCircle2, AlertCircle, ScanLine, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Spinner } from "@/components/scanner/spinner";
import { QualityWarning } from "@/components/scanner/quality-warning";
import { ReviewFlag } from "@/components/scanner/review-flag";
import { compressAndAssess, type ImageQuality } from "@/lib/scan-capture";

interface Student { id: string; name: string; roll_number: number; }
interface TestInfo { topic: string; total_marks: number; subject: string; questions: unknown[]; }
interface BatchResult {
  matchedStudent: Student | null; score: number | null; previewUrl: string; imageUrl?: string; driveUrl?: string;
  quality: ImageQuality; needsReview: boolean; reviewReason: string | null;
}
type Stage = "capture" | "grading" | "confirm" | "saving";

function BatchScanInner() {
  const params = useParams<{ classId: string; testId: string }>();
  const router = useRouter();
  const { classId, testId } = params;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("capture");
  const [testInfo, setTestInfo] = useState<TestInfo | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [scoreInput, setScoreInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [testRes, studentsRes] = await Promise.all([
        supabase.from("tests").select("topic, total_marks, subject, questions").eq("id", testId).single(),
        supabase.from("students").select("id, name, roll_number").eq("class_id", classId).eq("is_active", true).order("roll_number"),
      ]);
      if (testRes.data) {
        const raw = testRes.data.questions;
        const questions = raw ? (Array.isArray(raw) ? raw : (typeof raw === "string" ? JSON.parse(raw) : [])) : [];
        setTestInfo({ ...testRes.data, questions });
      }
      if (studentsRes.data) setStudents(studentsRes.data as Student[]);
    })();
  }, [classId, testId]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    void runGrading(file);
  }

  async function runGrading(file: File) {
    setStage("grading"); setError(null);
    const previewUrl = URL.createObjectURL(file);
    try {
      const { base64, mimeType, quality } = await compressAndAssess(file);
      const filename = `batch_${testId.slice(0, 8)}_${Date.now()}.jpg`;
      const [res, uploadRes] = await Promise.all([
        fetch("/api/grade-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType, students: students.map(s => ({ id: s.id, name: s.name, rollNumber: s.roll_number })), totalMarks: testInfo?.total_marks ?? 0, topic: testInfo?.topic ?? "", subject: testInfo?.subject ?? "", questions: testInfo?.questions ?? [] }),
        }),
        fetch("/api/upload-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64, mimeType, filename }),
        }),
      ]);
      if (!res.ok) { const b = (await res.json()) as { error?: string }; throw new Error(b.error ?? `Server error ${res.status}`); }
      const data = (await res.json()) as { matchedStudent: Student | null; score: number | null; needsReview?: boolean; reviewReason?: string | null };
      const uploadData = uploadRes.ok ? (await uploadRes.json()) as { url?: string; driveUrl?: string } : undefined;
      setResult({
        matchedStudent: data.matchedStudent, score: data.score, previewUrl, imageUrl: uploadData?.url, driveUrl: uploadData?.driveUrl,
        quality, needsReview: data.needsReview ?? false, reviewReason: data.reviewReason ?? null,
      });
      setSelectedStudentId(data.matchedStudent?.id ?? "");
      setScoreInput(data.score !== null ? String(data.score) : "");
      setStage("confirm");
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      setError(err instanceof Error ? err.message : "Grading failed. Please retake.");
      setStage("capture");
    }
  }

  async function handleSave() {
    if (!selectedStudentId) { setError("Select a student before saving."); return; }
    const score = Number(scoreInput);
    if (scoreInput.trim() === "" || isNaN(score) || score < 0 || score > (testInfo?.total_marks ?? 0)) { setError(`Enter a valid score (0 – ${testInfo?.total_marks ?? 0}).`); return; }
    setStage("saving"); setError(null);
    try {
      const res = await fetch("/api/save-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: selectedStudentId, testId, score, totalMarks: testInfo?.total_marks ?? 0, source: "batch_scan", imageUrl: result?.imageUrl, driveUrl: result?.driveUrl }),
      });
      if (!res.ok) { const b = (await res.json()) as { error?: string }; throw new Error(b.error ?? "Failed to save score"); }
      if (result?.previewUrl) URL.revokeObjectURL(result.previewUrl);
      setScannedCount(c => c + 1);
      setResult(null); setSelectedStudentId(""); setScoreInput(""); setStage("capture");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed. Try again.");
      setStage("confirm");
    }
  }

  function handleRetake() {
    if (result?.previewUrl) URL.revokeObjectURL(result.previewUrl);
    setResult(null); setSelectedStudentId(""); setScoreInput(""); setError(null); setStage("capture");
  }

  const totalMarks = testInfo?.total_marks ?? 0;
  const scoreNum = Number(scoreInput);
  const canSave = selectedStudentId !== "" && scoreInput.trim() !== "" && !isNaN(scoreNum) && scoreNum >= 0 && scoreNum <= totalMarks;
  const scorePct = totalMarks > 0 && scoreInput !== "" && !isNaN(scoreNum) ? Math.min(100, Math.round((scoreNum / totalMarks) * 100)) : 0;
  const scoreColor = scorePct >= 70 ? "text-emerald-600" : scorePct >= 40 ? "text-amber-600" : "text-red-500";

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 3.5rem - env(safe-area-inset-top, 0px))" }}>
      <div className="-mx-4 -mt-5 px-5 pt-4 pb-5 mb-4 shrink-0" style={{ background: "linear-gradient(145deg, #1e1b4b 0%, #312e81 50%, #1e3a8a 100%)" }}>
        <div className="flex items-center gap-3">
          <Link href={`/scanner/${classId}/tests`} className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 text-white active:scale-95 transition-transform shrink-0"><ArrowLeft size={20} /></Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black text-white leading-tight truncate">{testInfo?.topic ?? "Batch Scan"}</h1>
            <p className="text-xs font-bold text-indigo-300/70 mt-0.5">AI reads names automatically</p>
          </div>
          {scannedCount > 0 && <span className="shrink-0 flex items-center gap-1 text-xs font-black text-emerald-300 bg-white/10 rounded-xl px-3 py-1.5"><CheckCircle2 size={12} />{scannedCount} saved</span>}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleFileChange} aria-hidden />

      {stage === "capture" && (
        <div className="flex-1 flex flex-col items-center justify-between gap-5 pb-safe">
          <div className="w-full flex-1 rounded-3xl overflow-hidden flex flex-col items-center justify-center gap-5" style={{ background: "linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%)", minHeight: "min(55vw, 40vh)" }}>
            {scannedCount > 0 ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center"><CheckCircle2 size={24} className="text-emerald-400" /></div>
                <p className="text-sm font-bold text-emerald-300">{scannedCount} paper{scannedCount > 1 ? "s" : ""} scanned</p>
                <p className="text-xs text-white/40">Scan the next paper</p>
              </div>
            ) : (
              <div className="relative w-36 h-48">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-indigo-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-indigo-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-indigo-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-indigo-400 rounded-br-lg" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"><ScanLine size={26} className="text-indigo-400/60" /><p className="text-xs text-indigo-300/50 text-center px-2">Align answer sheet</p></div>
              </div>
            )}
          </div>
          {error && <div className="w-full bg-red-50 border border-red-100 rounded-2xl px-4 py-3"><p className="text-sm text-red-600 font-medium">{error}</p></div>}
          <button onClick={() => fileInputRef.current?.click()} disabled={!testInfo} className="w-full min-h-[60px] bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-black text-lg rounded-2xl shadow-xl shadow-indigo-300/30 active:scale-[0.97] transition-transform flex items-center justify-center gap-3 disabled:opacity-50">
            <Camera size={24} />{testInfo ? "Take Photo" : "Loading…"}
          </button>
          {scannedCount > 0 && (
            <button onClick={() => router.push(`/scanner/${classId}/tests/${testId}/scan`)} className="w-full min-h-[48px] border-2 border-gray-200 text-gray-600 font-bold text-base rounded-2xl active:scale-[0.97] transition-transform flex items-center justify-center gap-2 bg-white">
              View Progress <ChevronRight size={16} />
            </button>
          )}
        </div>
      )}

      {stage === "grading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 pb-safe">
          <div className="w-full rounded-3xl overflow-hidden bg-gray-900 flex items-center justify-center" style={{ minHeight: "min(55vw, 40vh)" }}>
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center"><Spinner size="lg" /></div>
              <div className="text-center"><p className="font-black text-white text-lg">Reading name &amp; grading…</p><p className="text-xs text-white/40 mt-1.5">Please keep the screen on</p></div>
            </div>
          </div>
        </div>
      )}

      {(stage === "confirm" || stage === "saving") && result && (
        <div className="flex-1 flex flex-col gap-4 pb-safe">
          <div className="w-full rounded-3xl overflow-hidden bg-gray-900 flex items-center justify-center shrink-0" style={{ minHeight: "min(45vw, 32vh)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={result.previewUrl} alt="Scanned paper" className="w-full h-full object-contain" />
          </div>
          {!result.quality.ok && result.quality.reason && (
            <QualityWarning reason={result.quality.reason} onRetake={handleRetake} />
          )}
          {result.needsReview && result.reviewReason && (
            <ReviewFlag reason={result.reviewReason} />
          )}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            {result.matchedStudent ? (
              <div className="flex items-center gap-3 bg-emerald-50 px-4 py-3 border-b border-emerald-100">
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                <div><p className="text-[10px] font-black tracking-[0.2em] uppercase text-emerald-600">AI matched</p><p className="text-sm font-black text-gray-900 mt-0.5">{result.matchedStudent.name}</p></div>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-amber-50 px-4 py-3 border-b border-amber-100">
                <AlertCircle size={18} className="text-amber-500 shrink-0" />
                <div><p className="text-[10px] font-black tracking-[0.2em] uppercase text-amber-600">Name not found</p><p className="text-xs text-gray-500 mt-0.5">Select the student manually</p></div>
              </div>
            )}
            <div className="px-4 py-4 space-y-4">
              <div>
                <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-gray-400 mb-1.5">Student</label>
                <div className="relative">
                  <select value={selectedStudentId} onChange={(e) => { setSelectedStudentId(e.target.value); setError(null); }} className="w-full appearance-none px-4 py-3 pr-8 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-h-[44px]">
                    <option value="">— Select student —</option>
                    {students.map(s => <option key={s.id} value={s.id}>{String(s.roll_number).padStart(2, "0")} · {s.name}</option>)}
                  </select>
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</div>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-gray-400 mb-1.5">Score out of {totalMarks}</label>
                <input type="number" inputMode="decimal" min={0} max={totalMarks} step="0.5" value={scoreInput} onChange={(e) => { setScoreInput(e.target.value); setError(null); }} placeholder="0" className="w-full text-4xl font-black text-center text-gray-900 bg-gray-50 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent py-3"
                  onFocus={e => setTimeout(() => e.target.scrollIntoView({ behavior: "smooth", block: "center" }), 350)} />
                {scoreInput !== "" && !isNaN(scoreNum) && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className={cn("h-full rounded-full transition-all", scorePct >= 70 ? "bg-emerald-500" : scorePct >= 40 ? "bg-amber-500" : "bg-red-500")} style={{ width: `${scorePct}%` }} /></div>
                    <p className={cn("text-xs font-bold text-right mt-1", scoreColor)}>{scorePct}%</p>
                  </div>
                )}
              </div>
              {error && <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3"><p className="text-sm text-red-600 font-medium">{error}</p></div>}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleRetake} disabled={stage === "saving"} className="flex-1 min-h-[56px] border-2 border-gray-200 text-gray-700 font-bold text-base rounded-2xl active:scale-95 transition-transform flex items-center justify-center gap-2 bg-white disabled:opacity-50">
              <RefreshCw size={17} /> Retake
            </button>
            <button onClick={() => void handleSave()} disabled={stage === "saving" || !canSave} className={cn("flex-[2] min-h-[56px] font-black text-base rounded-2xl transition-transform flex items-center justify-center gap-2", stage === "saving" || !canSave ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-xl shadow-indigo-200 active:scale-[0.97]")}>
              {stage === "saving" ? <><Spinner size="sm" /> Saving…</> : <>Save &amp; Next <ChevronRight size={17} /></>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BatchScanPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[60vh]"><Spinner size="lg" /></div>}>
      <BatchScanInner />
    </Suspense>
  );
}

