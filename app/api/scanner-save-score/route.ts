import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getClientIp } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { getScannerSchoolId, verifyTestInSchool } from "@/lib/scanner-auth";

// Scanner portal save — bypasses RLS via service role key.
// Authorization is via the signed school-scoped token from /api/scanner/connect,
// not a client-supplied teacherId (which anyone could guess/forge).
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = await checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
  }

  const schoolId = getScannerSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: {
    testId: string
    studentId: string
    score: number
    totalMarks: number
    breakdown?: unknown
    feedback?: string
    imageUrl?: string
    driveUrl?: string
  };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { testId, studentId, score, totalMarks, breakdown, feedback, imageUrl, driveUrl } = body;

  if (!testId || !studentId || score === undefined || !totalMarks) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (score < 0 || score > totalMarks) {
    return NextResponse.json({ error: 'score out of range' }, { status: 400 });
  }

  // Verify the test belongs to a class in the authenticated school
  if (!(await verifyTestInSchool(schoolId, testId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('marks').upsert(
    {
      id: crypto.randomUUID(),
      test_id: testId,
      student_id: studentId,
      score,
      entered_at: new Date().toISOString(),
      source: 'ai_scanned',
      breakdown: breakdown ?? null,
      feedback: feedback ?? null,
      image_url: imageUrl ?? null,
      drive_url: driveUrl ?? null,
    },
    { onConflict: 'student_id,test_id' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
