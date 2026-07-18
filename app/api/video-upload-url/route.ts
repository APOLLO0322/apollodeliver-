import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKET } from "@/lib/r2";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// 動画1本ぶんの、R2への直接アップロード用署名URLを発行する。
// ブラウザはこのURLに対して PUT で動画を直接アップロードする（サーバーを経由しない）。
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { projectId, filename, contentType } = body as {
    projectId?: string;
    filename?: string;
    contentType?: string;
  };

  if (!projectId || !filename) {
    return NextResponse.json({ error: "projectId と filename が必要です" }, { status: 400 });
  }

  // 既存の動画本数から連番を決める
  const { count: existing } = await supabaseAdmin
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("kind", "video");

  const seq = (existing ?? 0) + 1;
  const ext = filename.split(".").pop()?.toLowerCase() || "mp4";
  const key = `${projectId}/video-${String(seq).padStart(2, "0")}.${ext}`;

  // R2への PUT 用署名URL（10分有効）
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType || "video/mp4",
  });
  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 600 });

  return NextResponse.json({ seq, key, uploadUrl });
}