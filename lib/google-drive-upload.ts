// Best-effort archive of a scanned paper to a school's Google Drive folder,
// via a small Apps Script web app (see GOOGLE_DRIVE_UPLOAD_URL). This is
// deliberately never allowed to break the actual scan/grade/save flow — the
// Supabase Storage copy (see upload-scan / scanner-upload routes) is the
// one thing the in-app "View Paper" viewer relies on. Drive is a secondary,
// optional "Open in Drive" link, so any failure here is swallowed and just
// means that link doesn't show up for this particular scan.

export interface DriveUploadResult {
  url: string
  fileId: string
}

export async function uploadToGoogleDrive(
  imageBase64: string,
  filename: string,
  mimeType = 'image/jpeg',
): Promise<DriveUploadResult | null> {
  const uploadUrl = process.env.GOOGLE_DRIVE_UPLOAD_URL
  const secret = process.env.GOOGLE_DRIVE_UPLOAD_SECRET
  if (!uploadUrl || !secret) return null

  try {
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, imageBase64, filename, mimeType }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null

    const data = await res.json() as { url?: string; fileId?: string; error?: string }
    if (!data.url || !data.fileId) return null
    return { url: data.url, fileId: data.fileId }
  } catch {
    return null
  }
}
