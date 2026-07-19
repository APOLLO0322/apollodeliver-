import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// 案件の詳細＋閲覧ログ（新しい順）
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id が必要です" }, { status: 400 });
  }

  const { data: project, error } = await supabaseAdmin
    .from("projects")
    .select("id, link_id, name, shoot_date, delivery_type, select_enabled, expires_at, created_at")
    .eq("id", id)
    .single();

  if (error || !project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  const { data: assets } = await supabaseAdmin
    .from("assets")
    .select("id, kind, seq, original_filename")
    .eq("project_id", id)
    .order("seq", { ascending: true });

  const { data: events } = await supabaseAdmin
    .from("events")
    .select("id, action, meta, occurred_at")
    .eq("project_id", id)
    .order("occurred_at", { ascending: false })
    .limit(100);

  return NextResponse.json({
    project,
    photoCount: (assets ?? []).filter((a) => a.kind === "photo").length,
    videoCount: (assets ?? []).filter((a) => a.kind === "video").length,
    events: events ?? [],
  });
}