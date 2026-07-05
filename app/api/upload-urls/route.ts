import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// ブラウザが直接 Supabase Storage に上げるための「署名付きアップロードURL」を発行する。
// 実データはここを通らないので、リクエストは軽く、サイズ制限に当たらない。
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { projectId, count } = body as { projectId?: string; count?: number };

  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json({ error: "projectId がありません" }, { status: 400 });
  }
  const n = typeof count === "number" && count > 0 ? count : 0;
  if (n === 0) {
    return NextResponse.json({ error: "count が不正です" }, { status: 400 });
  }

  // 既存の写真枚数から連番の続きを決める
  const { count: existing } = await supabaseAdmin
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("kind", "photo");

  const startSeq = (existing ?? 0) + 1;
  const slots = [];

  for (let i = 0; i < n; i++) {
    const seq = startSeq + i;
    const seqStr = String(seq).padStart(3, "0");
    const originalKey = `${projectId}/${seqStr}.jpg`;
    const thumbKey = `${projectId}/${seqStr}.jpg`;

    const orig = await supabaseAdmin.storage
      .from("photos")
      .createSignedUploadUrl(originalKey);
    const thumb = await supabaseAdmin.storage
      .from("thumbnails")
      .createSignedUploadUrl(thumbKey);

    if (orig.error || thumb.error) {
      return NextResponse.json(
        { error: `URL発行に失敗: ${orig.error?.message ?? thumb.error?.message}` },
        { status: 500 }
      );
    }

    slots.push({
      seq,
      originalKey,
      thumbKey,
      originalUpload: { token: orig.data.token, path: orig.data.path },
      thumbUpload: { token: thumb.data.token, path: thumb.data.path },
    });
  }

  return NextResponse.json({ slots });
}
