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
import type { WsSection } from "@/lib/types";
import { QualityWarning } from "@/components/scanner/quality-warning";
import { ReviewFlag } from "@/components/scanner/review-flag";
import { compressAndAssess, type ImageQuality } from "@/lib/scan-capture";

interface Student { id: string; name: string; roll_number: number }
interface WorksheetInfo {
  topic: string
  subject: string
  grade: string
  totalMarks: number
  sections: WsSection[]
}

// Convert worksheet sections to AiQuestion format for multi-grade-scan
function sectionsToQuestions(sections: WsSection[]) {
  return sections.flatMap(sec =>
    sec.questions.map(q => ({
      text: q.text,
      type: sec.type as 'mcq' | 'fill-in-blank' | 'short-answer' | 'long-answer',
      difficulty: 'medium' as const,
      marks: sec.marksEach,
      options: q.options,
      answer: q.answer,
      keywords: undefined,
    }))
  );
}

export default function WorksheetMultiScanPage() {
  const params = useParams<{ worksheetId: string }>();
  const router = useRouter();
  const { worksheetId } = params;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [wsInfo, setWsInfo]       = useState<WorksheetInfo | null>(null);
  const [students, setStudents]   = useState<Student[]>([]);
  const [doneIds, setDoneIds]     = useState<Set<string>>(new Set());
  const [loading, setLoading]     = useState(true);
  const [classId, setClassId]     = useState<string | null>(null);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [pages, setPages]           = useState<{ dataUrl: string; quality: ImageQuality }[]>([]);
  const [capturing, setCapturing]   = useState(false);

  type Stage = "capture" | "grading" | "flagged" | "done-all";
  const [stage, setStage]       = useState<Stage>("capture");
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);

  const scannerToken = typeof window !== "undefined" ? (localStorage.getItem("scanner_token") ?? "") : "";
  const teacherName  = typeof window !== "undefined" ? (localStorage.getItem("scanner_teacher_name") ?? "") : "";

  useEffect(() => {
    void (async () => {
      // Fetch worksheet
      const wsRes = await supabase
        .from("worksheets")
        .select("topic, subject, grade, total_marks, sections, class_id")
        .eq("id", worksheetId)
        .single();

      if (!wsRes.data) { setLoading(false); return; }

      const raw = wsRes.data;
      const parsedSections: WsSection[] = Array.isArray(raw.sections)
        ? raw.sections as WsSection[]
        : (typeof raw.sections === "string" ? JSON.parse(raw.sections) : []);

      setWsInfo({
        topic: raw.topic,
        subject: raw.subject,
        grade: raw.grade,
        totalMarks: raw.total_marks,
        sections: parsedSections,
      });

      const cId = raw.class_id as string | null;
      setClassId(cId);

      if (cId) {
        const [studentsRes, marksRes] = await Promise.all([
          supabase.from("students").select("id, name, roll_number")
            .eq("class_id", cId).eq("is_active", true).order("roll_number"),
          supabase.from("worksheet_marks").select("student_id").eq("worksheet_id", worksheetId),
        ]);
        if (studentsRes.data) setStudents(studentsRes.data as Student[]);
        if (marksRes.data) {
          setDoneIds(new Set((marksRes.data as { student_id: string }[]).map(m => m.student_id)));
        }
      }
      setLoading(false);
    })();
  }, [worksheetId]);

  const pending      = students.filter(s => !doneIds.has(s.id));
  const current      = pending[currentIdx] ?? null;
  const totalStudents = students.length;
  const totalDone    = totalStudents - pending.length + savedCount;
  const pctDone      = totalStudents > 0 ? Math.round((totalDone / totalStudents) * 100) : 0;

  const handleCapture = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";
    setCapturing(true);
    compressAndAssess(file)
      .then(({ dataUrl, quality }) => setPages(prev => [...prev, { dataUrl, quality }]))
      .catch(err => setGradeError(String(err)))
      .finally(() => setCapturing(false));
  }, []);

  const advanceStudent = useCallback(() => {
    setPages([]);
    setGradeError(null);
    setCurrentIdx(prev => prev + 1);
  }, []);

  const handleSkip = () => advanceStudent();

  const handleDone = async () => {
    if (!current || pages.length === 0 || !wsInfo) return;
    setStage("grading");
    setGradeError(null);

    try {
      const questions = sectionsToQuestions(wsInfo.sections);
      const images = pages.map(p => p.dataUrl);

      const [gradeRes, uploadRes] = await Promise.all([
        fetch("/api/multi-grade-scan", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-scanner-token": scannerToken },
          body: JSON.stringify({
            images,
            worksheetId,
            studentId: current.id,
            studentName: current.name,
            totalMarks: wsInfo.totalMarks,
            topic: wsInfo.topic,
            subject: wsInfo.subject,
            questions,
          }),
        }),
        fetch("/api/scanner-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-scanner-token": scannerToken },
          body: JSON.stringify({
            worksheetId,
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
        breakdown: unknown
        feedback: string | null
        needsReview?: boolean
        reviewReason?: string | null
      };

      let imageUrl: string | undefined;
      let driveUrl: string | undefined;
      if (uploadRes.ok) {
        const up = (await uploadRes.json()) as { url?: string; driveUrl?: string };
        imageUrl = up.url;
        driveUrl = up.driveUrl;
      }

      const saveRes = await fetch("/api/worksheet-save-score", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-scanner-token": scannerToken },
        body: JSON.stringify({
          worksheetId,
          studentId: current.id,
          score: gradeData.score,
          totalMarks: wsInfo.totalMarks,
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
        setReviewReason(gradeData.reviewReason);
        setStage("flagged");
        return;
      }

      if (currentIdx + 1 >= pending.length) {
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
    if (currentIdx + 1 >= pending.length) {
      setStage("done-all");
    } else {
      setStage("capture");
      advanceStudent();
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Spinner size="lg" /></div>;
  }

  if (!wsInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <p className="text-gray-500 font-medium">Worksheet not found.</p>
        <Link href="/scanner/connect" className="text-indigo-600 font-bold text-sm">← Back</Link>
      </div>
    );
  }

  if (!classId || students.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <p className="text-gray-500 font-medium">No students linked to this worksheet&apos;s class.</p>
        <p className="text-xs text-gray-400">Assign the worksheet to a class in the teacher portal first.</p>
        <Link href="/scanner/connect" className="text-indigo-600 font-bold text-sm">← Back to tests</Link>
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

  if (stage === "done-all" || (!current && pending.length === 0)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 size={40} className="text-emerald-600" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-gray-900">All Done!</h2>
          <p className="text-sm text-gray-500 mt-1">
            {savedCount > 0 ? `${savedCount} worksheet${savedCount !== 1 ? "s" : ""} graded and saved.` : "All students scanned."}
          </p>
        </div>
        <button onClick={() => router.push("/scanner/connect")}
          className="bg-indigo-600 text-white font-black rounded-2xl px-8 py-4 shadow-xl shadow-indigo-200 active:scale-95 transition-transform">
          Back to Tests
        </button>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
        <p className="text-gray-500 font-medium">No students left to scan.</p>
        <Link href="/scanner/connect" className="text-indigo-600 font-bold text-sm">Back to tests →</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 3.5rem - env(safe-area-inset-top, 0px))" }}>
      {/* Header */}
      <div className="-mx-4 -mt-5 px-5 pt-4 pb-5 mb-4 shrink-0"
        style={{ background: "linear-gradient(145deg, #1e1b4b 0%, #312e81 50%, #1e3a8a 100%)" }}>
        <div className="flex items-center gap-3 mb-4">
          <Link href="/scanner/connect"
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 text-white active:scale-95 transition-transform shrink-0">
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-black text-white leading-tight truncate">{wsInfo.topic}</h1>
            <p className="text-xs font-bold text-indigo-300/70 mt-0.5">
              {teacherName ? `${teacherName} · ` : ""}{wsInfo.subject} · {wsInfo.totalMarks}m · Worksheet
            </p>
          </div>
          {savedCount > 0 && (
            <span className="shrink-0 flex items-center gap-1 text-xs font-black text-emerald-300 bg-white/10 rounded-xl px-3 py-1.5">
              <CheckCircle2 size={12} />{savedCount} saved
            </span>
          )}
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-white/60">{totalDone} of {totalStudents} done</span>
            <span className="text-xs font-black text-emerald-300">{pctDone}%</span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full transition-all duration-500" style={{ width: `${pctDone}%` }} />
          </div>
        </div>
      </div>

      {/* Current student */}
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
            {currentIdx + 1}<span className="text-gray-400 font-normal"> / {pending.length}</span>
          </p>
        </div>
      </div>

      <p className="text-xs text-center text-gray-400 font-semibold mb-3">
        {pages.length === 0
          ? "Photograph each page of this student's worksheet"
          : `${pages.length} page${pages.length !== 1 ? "s" : ""} captured — add more or tap Done`}
      </p>

      {/* Thumbnails */}
      {pages.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {pages.map((page, i) => (
            <div key={i} className="relative aspect-[3/4] rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={page.dataUrl} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
              <div className="absolute top-1 left-1 bg-black/50 text-white text-[9px] font-black rounded-md px-1.5 py-0.5">
                Pg {i + 1}
              </div>
              <button onClick={() => setPages(prev => prev.filter((_, pi) => pi !== i))}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center shadow">
                <Trash2 size={10} className="text-white" />
              </button>
            </div>
          ))}
          <button onClick={() => fileInputRef.current?.click()} disabled={capturing}
            className="aspect-[3/4] rounded-xl border-2 border-dashed border-indigo-200 flex flex-col items-center justify-center gap-1 bg-indigo-50 active:bg-indigo-100 transition-colors">
            {capturing ? <Loader2 size={20} className="text-indigo-400 animate-spin" /> : <Plus size={20} className="text-indigo-400" />}
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

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        className="sr-only" aria-hidden onChange={handleCapture} />

      {/* Actions */}
      <div className="mt-auto flex flex-col gap-3 pb-safe pt-2">
        {pages.length === 0 ? (
          <button onClick={() => fileInputRef.current?.click()}
            disabled={capturing || stage === "grading"}
            className="w-full min-h-[60px] bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-black text-lg rounded-2xl shadow-xl shadow-indigo-300/30 active:scale-[0.97] transition-transform flex items-center justify-center gap-3 disabled:opacity-50">
            {capturing ? <><Loader2 size={22} className="animate-spin" /> Loading…</> : <><Camera size={24} /> Capture Page</>}
          </button>
        ) : (
          <>
            <button onClick={() => fileInputRef.current?.click()}
              disabled={capturing || stage === "grading"}
              className="w-full min-h-[48px] border-2 border-indigo-200 text-indigo-700 font-bold text-base rounded-2xl active:scale-[0.97] transition-transform flex items-center justify-center gap-2 bg-indigo-50 disabled:opacity-50">
              {capturing ? <><Loader2 size={18} className="animate-spin" /> Loading…</> : <><Plus size={18} /> Add Another Page</>}
            </button>
            <button onClick={() => void handleDone()} disabled={stage === "grading"}
              className={cn(
                "w-full min-h-[60px] font-black text-lg rounded-2xl transition-transform flex items-center justify-center gap-3",
                stage === "grading"
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-xl shadow-emerald-300/30 active:scale-[0.97]"
              )}>
              {stage === "grading"
                ? <><ScanLine size={22} className="animate-pulse" /> AI Grading…</>
                : <><CheckCircle2 size={22} /> Done — Grade &amp; Save</>}
            </button>
          </>
        )}
        <button onClick={handleSkip} disabled={stage === "grading"}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 text-gray-400 font-semibold text-sm disabled:opacity-40">
          <SkipForward size={14} /> Skip this student
        </button>
      </div>
    </div>
  );
}
