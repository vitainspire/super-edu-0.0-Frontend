import { createServerComponentClient } from "@/lib/supabase-server";
import { ScanProgressView } from "./scan-progress-view";
import type { StudentRow } from "./scan-progress-view";

interface Props { params: { classId: string; testId: string }; }
interface MarkRow { student_id: string; score: number; }
interface StudentDbRow { id: string; name: string; roll_number: number; }

export default async function ScanPage({ params }: Props) {
  const { classId, testId } = params;
  const supabase = await createServerComponentClient();

  const [classResult, testResult, studentsResult, marksResult] = await Promise.all([
    supabase.from("classes").select("grade, section, name").eq("id", classId).single(),
    supabase.from("tests").select("topic, total_marks").eq("id", testId).single(),
    supabase.from("students").select("id, name, roll_number").eq("class_id", classId).eq("is_active", true).order("roll_number"),
    supabase.from("marks").select("student_id, score, source").eq("test_id", testId),
  ]);

  if (classResult.error) throw new Error(classResult.error.message);
  if (testResult.error) throw new Error(testResult.error.message);
  if (studentsResult.error) throw new Error(studentsResult.error.message);

  const marks = (marksResult.data ?? []) as MarkRow[];
  const scoreMap = new Map<string, number>(marks.map((m) => [m.student_id, m.score]));
  const allStudents = (studentsResult.data ?? []) as StudentDbRow[];

  const pendingStudents: StudentRow[] = allStudents
    .filter((s) => !scoreMap.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, roll_number: s.roll_number, score: null }));

  const doneStudents: StudentRow[] = allStudents
    .filter((s) => scoreMap.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, roll_number: s.roll_number, score: scoreMap.get(s.id) ?? null }));

  const classData = classResult.data as { grade: string; section: string; name: string };
  const testData = testResult.data as { topic: string; total_marks: number };

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
