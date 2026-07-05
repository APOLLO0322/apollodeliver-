import { NextResponse } from "next/server";
import sharp from "sharp";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
// 大きめの写真も受けられるように（Vercelの制限内で最大化）
export const maxDuration = 60;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "フォームの読み取りに失敗しました" }, { status: 400 });
  }

  const projectId = form.get("projectId");
  const files = form.getAll("files");

  if (typeof projectId !== "string" || !projectId) {
    return NextResponse.json({ error: "projectId がありません" }, { status: 400 });
  }
  if (files.length === 0) {
    return NextResponse.json({ error: "ファイルがありません" }, { status: 400 });
  }

  // 既存の写真枚数を数えて、連番(seq)の続きから振る
  const { count: existing } = await supabaseAdmin
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("kind", "photo");

  let seq = existing ?? 0;
  const saved: { seq: number; name: string }[] = [];

  for (const file of files) {
    if (!(file instanceof File)) continue;
    seq += 1;

    const buffer = Buffer.from(await file.arrayBuffer());
    const seqStr = String(seq).padStart(3, "0");
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";

    // 原本を photos に保存
    const originalKey = `${projectId}/${seqStr}.${ext}`;
    const up1 = await supabaseAdmin.storage
      .from("photos")
      .upload(originalKey, buffer, { contentType: file.type, upsert: true });
    if (up1.error) {
      return NextResponse.json({ error: `原本の保存に失敗: ${up1.error.message}` }, { status: 500 });
    }

    // 軽量版(長辺2000px・JPEG)を生成して thumbnails に保存
    const thumb = await sharp(buffer)
      .rotate() // Exifの回転情報を反映
      .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const thumbKey = `${projectId}/${seqStr}.jpg`;
    const up2 = await supabaseAdmin.storage
      .from("thumbnails")
      .upload(thumbKey, thumb, { contentType: "image/jpeg", upsert: true });
    if (up2.error) {
      return NextResponse.json({ error: `軽量版の保存に失敗: ${up2.error.message}` }, { status: 500 });
    }

    // assets テーブルに記録
    const ins = await supabaseAdmin.from("assets").insert({
      project_id: projectId,
      kind: "photo",
      storage: "supabase",
      storage_key: originalKey,
      thumb_key: thumbKey,
      original_filename: file.name,
      size_bytes: buffer.length,
      seq,
      display_order: seq,
    });
    if (ins.error) {
      return NextResponse.json({ error: `記録に失敗: ${ins.error.message}` }, { status: 500 });
    }

    saved.push({ seq, name: file.name });
  }

  return NextResponse.json({ uploaded: saved.length, files: saved });
}
