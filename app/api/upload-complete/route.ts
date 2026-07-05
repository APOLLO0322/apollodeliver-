import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// ブラウザが Storage への直接アップロードを終えた後、その結果を assets に記録する。
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { projectId, items } = body as {
    projectId?: string;
    items?: {
      seq: number;
      originalKey: string;
      thumbKey: string;
      originalFilename: string;
      sizeBytes: number;
    }[];
  };

  if (!projectId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "パラメータが不正です" }, { status: 400 });
  }

  const rows = items.map((it) => ({
    project_id: projectId,
    kind: "photo" as const,
    storage: "supabase" as const,
    storage_key: it.originalKey,
    thumb_key: it.thumbKey,
    original_filename: it.originalFilename,
    size_bytes: it.sizeBytes,
    seq: it.seq,
    display_order: it.seq,
  }));

  const { error } = await supabaseAdmin.from("assets").insert(rows);
  if (error) {
    return NextResponse.json({ error: `記録に失敗: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ recorded: rows.length });
}
