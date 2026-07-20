import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { getClientIp } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { getScannerSchoolId, verifyTestInSchool, verifyWorksheetInSchool } from "@/lib/scanner-auth";
import { uploadToGoogleDrive } from "@/lib/google-drive-upload";

export const maxDuration = 30;

// Upload a scanned paper image from the scanner portal.
// Authorization is via the signed school-scoped token from /api/scanner/connect,
// not a client-supplied teacherId (which anyone could guess/forge).
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = await checkRateLimit(ip);
  if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });

  const schoolId = getScannerSchoolId(request);
  if (!schoolId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { testId?: string; worksheetId?: string; studentId: string; imageDataUrl: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { testId, worksheetId, studentId, imageDataUrl } = body;
  if ((!testId && !worksheetId) || !studentId || !imageDataUrl) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const commaIdx = imageDataUrl.indexOf(',');
  if (commaIdx === -1) return NextResponse.json({ error: 'Invalid data URL' }, { status: 400 });
  const base64 = imageDataUrl.slice(commaIdx + 1);

  // Verify the test/worksheet belongs to a class in the authenticated school
  if (testId) {
    if (!(await verifyTestInSchool(schoolId, testId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (worksheetId) {
    if (!(await verifyWorksheetInSchool(schoolId, worksheetId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const admin = createAdminClient();
  const buffer = Buffer.from(base64, 'base64');
  const folder = testId ? `scanner/${testId.slice(0, 8)}` : `worksheets/${worksheetId!.slice(0, 8)}`;
  const filename = `${folder}/${studentId.slice(0, 8)}_${Date.now()}.jpg`;

  const { error: uploadErr } = await admin.storage
    .from('scanned-papers')
    .upload(filename, buffer, { contentType: 'image/jpeg', upsert: true });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data: urlData } = admin.storage.from('scanned-papers').getPublicUrl(filename);

  // Best-effort parallel archive to Google Drive — never blocks or fails this
  // request; the Supabase copy above is the one the app relies on.
  const drive = await uploadToGoogleDrive(base64, filename.split('/').pop() ?? filename, 'image/jpeg');

  return NextResponse.json({ url: urlData.publicUrl, driveUrl: drive?.url });
}
