import { backendFetchServer } from "@/lib/supabase-server";
import { ScanProgressView } from "./scan-progress-view";
import type { StudentRow } from "./scan-progress-view";

interface Props { params: { classId: string; testId: string }; }
interface MarkRow { student_id: string; score: number; }
interface StudentDbRow { id: string; name: string; roll_number: number; }

export default async function ScanPage({ params }: Props) {
  const { classId, testId } = params;

  const res = await backendFetchServer(`/api/scanner/tests/${testId}`);
  if (!res.ok) throw new Error(`Failed to load test (${res.status})`);
  const data = (await res.json()) as {
    test: { topic: string; total_marks: number };
    class: { grade: string; section: string; name: string } | null;
    students: StudentDbRow[];
    marks: MarkRow[];
  };

  const scoreMap = new Map<string, number>(data.marks.map((m) => [m.student_id, m.score]));
  const allStudents = data.students;

  const pendingStudents: StudentRow[] = allStudents
    .filter((s) => !scoreMap.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, roll_number: s.roll_number, score: null }));

  const doneStudents: StudentRow[] = allStudents
    .filter((s) => scoreMap.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, roll_number: s.roll_number, score: scoreMap.get(s.id) ?? null }));

  const classData = data.class as { grade: string; section: string; name: string };
  const testData = data.test;

  return (
    <ScanProgressView
      classId={classId}
      testId={testId}
      classInfo={classData}
      testInfo={testData}
      pendingStudents={pendingStudents}
      doneStudents={doneStudents}
    />
  );
}
