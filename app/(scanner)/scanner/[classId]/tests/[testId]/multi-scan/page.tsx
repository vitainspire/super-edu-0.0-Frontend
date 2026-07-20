"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Camera, Plus, CheckCircle2, ChevronRight,
  Trash2, ScanLine, SkipForward, Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Spinner } from "@/components/scanner/spinner";
import { cn } from "@/lib/utils";
import { QualityWarning } from "@/components/scanner/quality-warning";
import { ReviewFlag } from "@/components/scanner/review-flag";
import { compressAndAssess, type ImageQuality } from "@/lib/scan-capture";

interface Student { id: string; name: string; roll_number: number }
interface TestInfo { topic: string; total_marks: number; subject: string; questions: unknown[] }

export default function MultiScanPage() {
  const params = useParams<{ classId: string; testId: string }>();
  const router = useRouter();
  const { classId, testId } = params;

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data
  const [testInfo, setTestInfo]   = useState<TestInfo | null>(null);
  const [students, setStudents]   = useState<Student[]>([]);
  const [doneIds, setDoneIds]     = useState<Set<string>>(new Set());
  const [loading, setLoading]     = useState(true);

  // Current student index into `students` (we skip doneIds)
  const [currentIdx, setCurrentIdx] = useState(0);

  // Captured pages for current student
  const [pages, setPages]       = useState<{ dataUrl: string; thumb: string; quality: ImageQuality }[]>([]);
  const [capturing, setCapturing] = useState(false);

  // Grading/saving state
  type Stage = "capture" | "grading" | "flagged" | "done-all";
  const [stage, setStage] = useState<Stage>("capture");
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const scannerToken = typeof window !== "undefined" ? (localStorage.getItem("scanner_token") ?? "") : "";
  const teacherName  = typeof window !== "undefined" ? (localStorage.getItem("scanner_teacher_name") ?? "") : "";

  // Load test + students + already-done marks
  useEffect(() => {
    void (async () => {
      const [testRes, studentsRes, marksRes] = await Promise.all([
        supabase.from("tests").select("topic, total_marks, subject, questions").eq("id", testId).single(),
        supabase.from("students").select("id, name, roll_number").eq("class_id", classId).eq("is_active", true).order("roll_number"),
        supabase.from("marks").select("student_id").eq("test_id", testId),
      ]);
      if (testRes.data) {
        const raw = testRes.data.questions;
        const q = raw ? (Array.isArray(raw) ? raw : (typeof raw === "string" ? JSON.parse(raw) : [])) : [];
        setTestInfo({ ...testRes.data, questions: q });
      }
      if (studentsRes.data) setStudents(studentsRes.data as Student[]);
      if (marksRes.data) {
        const ids = new Set((marksRes.data as { student_id: string }[]).map(m => m.student_id));
        setDoneIds(ids);
      }
      setLoading(false);
    })();
  }, [classId, testId]);

  // Pending students = all minus already done
  const pending = students.filter(s => !doneIds.has(s.id));
  const current = pending[currentIdx] ?? null;
  const totalPending = pending.length;
  const totalStudents = students.length;
  const totalDone = totalStudents - totalPending + savedCount;

  const handleCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    setCapturing(true);
    compressAndAssess(file)
      .then(({ dataUrl, quality }) => {
        setPages(prev => [...prev, { dataUrl, thumb: dataUrl, quality }]);
      })
      .catch(err => { setGradeError(String(err)); })
      .finally(() => setCapturing(false));
  }, []);

  const removePage = (idx: number) => {
    setPages(prev => prev.filter((_, i) => i !== idx));
  };

  const advanceStudent = useCallback(() => {
    setPages([]);
    setGradeError(null);
    setCurrentIdx(prev => prev + 1);
  }, []);

  const handleSkip = () => {
    advanceStudent();
  };

  const handleDone = async () => {
    if (!current || pages.length === 0 || !testInfo) return;
    setStage("grading");
    setGradeError(null);

    try {
      // Grade all pages together + upload page 1 to storage in parallel
      const images = pages.map(p => p.dataUrl);
      const [gradeRes, uploadRes] = await Promise.all([
        fetch("/api/multi-grade-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-scanner-token": scannerToken },
          body: JSON.stringify({
            images,
            testId,
            studentId: current.id,
            studentName: current.name,
            totalMarks: testInfo.total_marks,
            topic: testInfo.topic,
            subject: testInfo.subject,
            questions: testInfo.questions,
          }),
        }),
        // Upload the first page so the teacher can review it later
        fetch("/api/scanner-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-scanner-token": scannerToken },
          body: JSON.stringify({
            testId,
            studentId: current.id,
            imageDataUrl: pages[0].dataUrl,
          }),
        }),
      ]);

      if (!gradeRes.ok) {
        const b = (await gradeRes.json()) as { error?: string };
        throw new Error(b.error ?? `Grading failed (${gradeRes.status})`);
      }

      const gradeData = (await gradeRes.json()) as {
        score: number
        breakdown: { question: number; awarded: number; max: number; note?: string; errorType?: string | null }[]
        feedback: string | null
        needsReview?: boolean
        reviewReason?: string | null
      };

      // Get uploaded image URL (best-effort — if upload failed we still save the mark)
      let imageUrl: string | undefined;
      let driveUrl: string | undefined;
      if (uploadRes.ok) {
        const uploadData = (await uploadRes.json()) as { url?: string; driveUrl?: string };
        imageUrl = uploadData.url;
        driveUrl = uploadData.driveUrl;
      }

      // Save score via scanner-save-score (school-scoped token, no Supabase session needed)
      const saveRes = await fetch("/api/scanner-save-score", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-scanner-token": scannerToken },
        body: JSON.stringify({
          testId,
          studentId: current.id,
          score: gradeData.score,
          totalMarks: testInfo.total_marks,
          breakdown: gradeData.breakdown,
          feedback: gradeData.feedback,
          imageUrl,
          driveUrl,
        }),
      });

      if (!saveRes.ok) {
        const b = (await saveRes.json()) as { error?: string };
        throw new Error(b.error ?? `Save failed (${saveRes.status})`);
      }

      setSavedCount(c => c + 1);
      setDoneIds(prev => new Set([...prev, current.id]));

      if (gradeData.needsReview && gradeData.reviewReason) {
        // Saved, but flagged as worth a second look — pause here instead of
        // auto-advancing, so it isn't silently accepted like a normal scan.
        setReviewReason(gradeData.reviewReason);
        setStage("flagged");
        return;
      }

      // Move to next
      if (currentIdx + 1 >= totalPending) {
        setStage("done-all");
      } else {
        setStage("capture");
        advanceStudent();
      }
    } catch (err) {
      setGradeError(err instanceof Error ? err.message : "Unknown error");
      setStage("capture");
    }
  };

  const handleContinueAfterFlag = () => {
    setReviewReason(null);
    if (currentIdx + 1 >= totalPending) {
      setStage("done-all");
    } else {
      setStage("capture");
      advanceStudent();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (stage === "flagged" && reviewReason) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-6 text-center">
        <div className="w-full max-w-sm text-left">
          <ReviewFlag reason={reviewReason} />
        </div>
        <button
          onClick={handleContinueAfterFlag}
          className="w-full max-w-sm bg-indigo-600 text-white font-black rounded-2xl px-8 py-4 shadow-xl shadow-indigo-200 active:scale-95 transition-transform"
        >
          Continue
        </button>
      </div>
    );
  }

  if (stage === "done-all" || (!current && pending.length === 0 && students.length > 0)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 size={40} className="text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-gray-900">All Done!</h2>
          <p className="text-sm text-gray-500 mt-1">
            {savedCount > 0 ? `${savedCount} paper${savedCount !== 1 ? "s" : ""} graded and saved.` : "All students have been scanned."}
          </p>
        </div>
        <button
          onClick={() => router.push(`/scanner/${classId}/tests/${testId}/scan`)}
          className="bg-indigo-600 text-white font-black rounded-2xl px-8 py-4 shadow-xl shadow-indigo-200 active:scale-95 transition-transform"
        >
          View Results
        </button>
        <button
          onClick={() => router.push("/scanner/connect")}
          className="text-gray-400 font-semibold text-sm"
        >
          Back to tests
        </button>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <p className="text-gray-500 font-medium">No students to scan.</p>
        <Link href={`/scanner/${classId}/tests/${testId}/scan`} className="text-indigo-600 font-bold text-sm">
          View progress →
        </Link>
      </div>
    );
  }

  const pctDone = totalStudents > 0 ? Math.round((totalDone / totalStudents) * 100) : 0;

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 3.5rem - env(safe-area-inset-top, 0px))" }}>
      {/* Header */}
      <div
        className="-mx-4 -mt-5 px-5 pt-4 pb-5 mb-4 shrink-0"
        style={{ background: "linear-gradient(145deg, #1e1b4b 0%, #312e81 50%, #1e3a8a 100%)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <Link
            href={`/scanner/${classId}/tests/${testId}/scan`}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 text-white active:scale-95 transition-transform shrink-0"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-black text-white leading-tight truncate">
              {testInfo?.topic ?? "Multi-Scan"}
            </h1>
            <p className="text-xs font-bold text-indigo-300/70 mt-0.5">
              {teacherName ? `${teacherName} · ` : ""}{testInfo?.total_marks ?? 0}m · {testInfo?.subject ?? ""}
            </p>
          </div>
          {savedCount > 0 && (
            <span className="shrink-0 flex items-center gap-1 text-xs font-black text-emerald-300 bg-white/10 rounded-xl px-3 py-1.5">
              <CheckCircle2 size={12} />{savedCount} saved
            </span>
          )}
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-white/60">{totalDone} of {totalStudents} done</span>
            <span className="text-xs font-black text-emerald-300">{pctDone}%</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${pctDone}%` }}
            />
          </div>
        </div>
      </div>

      {/* Current student card */}
      <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm px-4 py-3 mb-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-sm font-black shrink-0">
          {String(current.roll_number).padStart(2, "0")}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-indigo-500 font-bold uppercase tracking-wide">Current student</p>
          <p className="font-black text-gray-900 truncate">{current.name}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-gray-400 font-semibold">Student</p>
          <p className="text-sm font-black text-gray-700">
            {currentIdx + 1}<span className="text-gray-400 font-normal"> / {totalPending}</span>
          </p>
        </div>
      </div>

      {/* Instruction */}
      <p className="text-xs text-center text-gray-400 font-semibold mb-3">
        {pages.length === 0
          ? "Tap + to photograph each page of this student's answer sheet"
          : `${pages.length} page${pages.length !== 1 ? "s" : ""} captured — add more or tap Done`}
      </p>

      {/* Thumbnails grid */}
      {pages.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {pages.map((page, i) => (
            <div key={i} className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={page.thumb} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
              <div className="absolute top-1 left-1 bg-black/50 text-white text-[9px] font-black rounded-md px-1.5 py-0.5">
                Pg {i + 1}
              </div>
              <button
                onClick={() => removePage(i)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shadow"
              >
                <Trash2 size={10} className="text-white" />
              </button>
            </div>
          ))}

          {/* Add more tile */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={capturing}
            className="aspect-[3/4] rounded-xl border-2 border-dashed border-indigo-200 flex flex-col items-center justify-center gap-1 bg-indigo-50 active:bg-indigo-100 transition-colors"
          >
            {capturing
              ? <Loader2 size={20} className="text-indigo-400 animate-spin" />
              : <Plus size={20} className="text-indigo-400" />}
            <span className="text-[9px] font-bold text-indigo-400">{capturing ? "Loading…" : "Add page"}</span>
          </button>
        </div>
      )}

      {(() => {
        const badPage = pages.find(p => !p.quality.ok);
        return badPage?.quality.reason ? (
          <div className="mb-4">
            <QualityWarning reason={badPage.quality.reason} onRetake={() => setPages([])} />
          </div>
        ) : null;
      })()}

      {gradeError && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 mb-4">
          <p className="text-sm text-red-600 font-medium">{gradeError}</p>
        </div>
      )}

      {/* Hidden camera input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleCapture}
        aria-hidden
      />

      {/* Actions */}
      <div className="mt-auto flex flex-col gap-3 pb-safe pt-2">
        {pages.length === 0 ? (
          /* No pages yet — big capture button */
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={capturing || stage === "grading"}
            className="w-full min-h-[60px] bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-black text-lg rounded-2xl shadow-xl shadow-indigo-300/30 active:scale-[0.97] transition-transform flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {capturing
              ? <><Loader2 size={22} className="animate-spin" /> Loading…</>
              : <><Camera size={24} /> Capture Page</>}
          </button>
        ) : (
          /* Pages captured — show Done + another capture option */
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={capturing || stage === "grading"}
              className="w-full min-h-[48px] border-2 border-indigo-200 text-indigo-700 font-bold text-base rounded-2xl active:scale-[0.97] transition-transform flex items-center justify-center gap-2 bg-indigo-50 disabled:opacity-50"
            >
              {capturing
                ? <><Loader2 size={18} className="animate-spin" /> Loading…</>
                : <><Plus size={18} /> Add Another Page</>}
            </button>

            <button
              onClick={() => void handleDone()}
              disabled={stage === "grading"}
              className={cn(
                "w-full min-h-[60px] font-black text-lg rounded-2xl transition-transform flex items-center justify-center gap-3",
                stage === "grading"
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-xl shadow-emerald-300/30 active:scale-[0.97]"
              )}
            >
              {stage === "grading"
                ? <><ScanLine size={22} className="animate-pulse" /> AI Grading…</>
                : <><CheckCircle2 size={22} /> Done — Grade &amp; Save</>}
            </button>
          </>
        )}

        {/* Skip this student */}
        <button
          onClick={handleSkip}
          disabled={stage === "grading"}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 text-gray-400 font-semibold text-sm disabled:opacity-40"
        >
          <SkipForward size={14} /> Skip this student
        </button>
      </div>
    </div>
  );
}
