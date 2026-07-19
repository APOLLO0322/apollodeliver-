import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { r2, R2_BUCKET } from "@/lib/r2";

export const runtime = "nodejs";

// 管理画面用のプレビュー。制限なしで原本DLもできる。
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id が必要です" }, { status: 400 });

  const { data: assets } = await supabaseAdmin
    .from("assets")
    .select("id, kind, storage, seq, storage_key, thumb_key, original_filename")
    .eq("project_id", id)
    .order("seq", { ascending: true });

  const photos = [];
  const videos = [];

  for (const a of assets ?? []) {
    if (a.kind === "photo") {
      const { data: thumb } = await supabaseAdmin.storage
        .from("thumbnails")
        .createSignedUrl(a.thumb_key!, 3600);
      const { data: orig } = await supabaseAdmin.storage
        .from("photos")
        .createSignedUrl(a.storage_key, 3600, {
          download: a.original_filename ?? `${String(a.seq).padStart(3, "0")}.jpg`,
        });
      photos.push({
        id: a.id,
        seq: a.seq,
        url: thumb?.signedUrl ?? null,
        downloadUrl: orig?.signedUrl ?? null,
        filename: a.original_filename ?? `${String(a.seq).padStart(3, "0")}.jpg`,
      });
    }

    if (a.kind === "video" && a.storage === "r2") {
      const playUrl = await getSignedUrl(
        r2,
        new GetObjectCommand({ Bucket: R2_BUCKET, Key: a.storage_key }),
        { expiresIn: 7200 }
      );
      const downloadUrl = await getSignedUrl(
        r2,
        new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: a.storage_key,
          ResponseContentDisposition: `attachment; filename="${a.original_filename ?? `video-${a.seq}.mp4`}"`,
        }),
        { expiresIn: 7200 }
      );
      videos.push({
        id: a.id,
        seq: a.seq,
        playUrl,
        downloadUrl,
        filename: a.original_filename ?? `video-${a.seq}.mp4`,
      });
    }
  }

  return NextResponse.json({ photos, videos });
}