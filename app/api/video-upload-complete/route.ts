import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// 動画のR2アップロード完了後、assets に記録する。
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { projectId, seq, key, filename, sizeBytes } = body as {
    projectId?: string;
    seq?: number;
    key?: string;
    filename?: string;
    sizeBytes?: number;
  };

  if (!projectId || !key || typeof seq !== "number") {
    return NextResponse.json({ error: "パラメータが不正です" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("assets").insert({
    project_id: projectId,
    kind: "video",
    storage: "r2",
    storage_key: key,
    original_filename: filename ?? null,
    size_bytes: sizeBytes ?? null,
    seq,
    display_order: 1000 + seq, // 動画は写真の後ろに並べる
  });

  if (error) {
    return NextResponse.json({ error: `記録に失敗: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
