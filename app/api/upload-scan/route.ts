import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase-server";
import { parseBody, UploadScanSchema } from "@/lib/schemas";
import { apiLog, getClientIp } from "@/lib/logger";
import { uploadToGoogleDrive } from "@/lib/google-drive-upload";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const t  = Date.now()

  try {
    const supabase = await createServerComponentClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      apiLog({ route: 'upload-scan', ip, durationMs: Date.now() - t, fromCache: false, status: 'unauthorized' })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = parseBody(UploadScanSchema, await request.json().catch(() => null))
    if (!parsed.ok) {
      apiLog({ route: 'upload-scan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'bad_request' })
      return parsed.response
    }
    const { imageBase64, mimeType = "image/jpeg", filename = "scan.jpg" } = parsed.data

    const buffer     = Buffer.from(imageBase64, "base64");
    const uniqueName = `${Date.now()}_${filename}`;

    const { error: uploadError } = await supabase.storage
      .from("scanned-papers")
      .upload(uniqueName, buffer, { contentType: mimeType, upsert: false });

    if (uploadError) {
      apiLog({ route: 'upload-scan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'error', error: uploadError.message })
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabase.storage
      .from("scanned-papers")
      .getPublicUrl(uniqueName);

    // Best-effort parallel archive to Google Drive — never blocks or fails
    // this request; the Supabase copy above is the one the app relies on.
    const drive = await uploadToGoogleDrive(imageBase64, uniqueName, mimeType);

    apiLog({ route: 'upload-scan', ip, userId: user.id, durationMs: Date.now() - t, fromCache: false, status: 'ok' })
    return NextResponse.json({ url: urlData.publicUrl, driveUrl: drive?.url });
  } catch (err) {
    apiLog({ route: 'upload-scan', ip, durationMs: Date.now() - t, fromCache: false, status: 'error', error: String(err) })
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
