import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase-server";
import { parseBody, SaveScoreSchema } from "@/lib/schemas";
import { apiLog, getClientIp } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const t  = Date.now()

  try {
    const supabase = await createServerComponentClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      apiLog({ route: 'save-score', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = parseBody(SaveScoreSchema, await request.json().catch(() => null))
    if (!parsed.ok) {
      apiLog({ route: 'save-score', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'bad_request' })
      return parsed.response
    }
    const { studentId, testId, score, totalMarks, source, breakdown, feedback, imageUrl, driveUrl } = parsed.data

    if (score > totalMarks) {
      apiLog({ route: 'save-score', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'bad_request', error: 'score > totalMarks' })
      return NextResponse.json({ error: "score cannot exceed totalMarks" }, { status: 400 });
    }

    const { error } = await supabase.from("marks").upsert(
      {
        id: crypto.randomUUID(),
        test_id: testId,
        student_id: studentId,
        score,
        entered_at: new Date().toISOString(),
        source: source ?? "ai_scanned",
        breakdown: breakdown ?? null,
        feedback: feedback ?? null,
        image_url: imageUrl ?? null,
        drive_url: driveUrl ?? null,
      },
      { onConflict: "student_id,test_id" }
    );

    if (error) {
      apiLog({ route: 'save-score', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: error.message })
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    apiLog({ route: 'save-score', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({ success: true });
  } catch (err) {
    apiLog({ route: 'save-score', ip, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
