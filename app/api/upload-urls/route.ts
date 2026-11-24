import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { photoKeys, signPhotoPut } from "@/lib/r2-photos";

export const runtime = "nodejs";

// ブラウザが直接 R2 に上げるための「署名付きアップロードURL」を発行する。
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
  const { count: existing, error: countError } = await supabaseAdmin
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("kind", "photo");

  // 枚数が分からないまま進めると、既存の写真を上書きしてしまう
  if (countError || existing === null) {
    return NextResponse.json({ error: "写真の枚数を確認できませんでした" }, { status: 500 });
  }

  const startSeq = existing + 1;
  const slots = [];

  for (let i = 0; i < n; i++) {
    const seq = startSeq + i;
    const { originalKey, thumbKey } = photoKeys(projectId, seq);

    slots.push({
      seq,
      originalKey,
      thumbKey,
      originalUploadUrl: await signPhotoPut(originalKey),
      thumbUploadUrl: await signPhotoPut(thumbKey),
    });
  }

  return NextResponse.json({ slots });
}
