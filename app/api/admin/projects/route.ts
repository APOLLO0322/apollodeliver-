import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// 案件一覧（新しい順）。写真・動画の点数も一緒に返す。
export async function GET() {
  const { data: projects, error } = await supabaseAdmin
    .from("projects")
    .select("id, link_id, name, shoot_date, delivery_type, select_enabled, expires_at, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: assets } = await supabaseAdmin
    .from("assets")
    .select("project_id, kind");

  const counts = new Map<string, { photos: number; videos: number }>();
  for (const a of assets ?? []) {
    const c = counts.get(a.project_id) ?? { photos: 0, videos: 0 };
    if (a.kind === "photo") c.photos++;
    if (a.kind === "video") c.videos++;
    counts.set(a.project_id, c);
  }

  return NextResponse.json({
    projects: (projects ?? []).map((p) => ({
      ...p,
      photoCount: counts.get(p.id)?.photos ?? 0,
      videoCount: counts.get(p.id)?.videos ?? 0,
    })),
  });
}