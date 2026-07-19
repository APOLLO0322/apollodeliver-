import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyLine } from "@/lib/notify";

export const runtime = "nodejs";

// 動画が再生されたときに呼ばれる。
// 記録は毎回残し、LINE通知はその案件で初回のみ（シークや再生し直しで連発しないように）。
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { linkId } = body as { linkId?: string };

  if (!linkId) {
    return NextResponse.json({ error: "linkId が必要です" }, { status: 400 });
  }

  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id, name")
    .eq("link_id", linkId)
    .single();

  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  await supabaseAdmin.from("events").insert({
    project_id: project.id,
    action: "play",
    meta: {},
  });

  const { count } = await supabaseAdmin
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id)
    .eq("action", "play");

  // 今回の1件を含めて1件＝初回のときだけ通知
  if ((count ?? 0) <= 1) {
    await notifyLine(`${project.name}の動画が再生されました`);
  }

  return NextResponse.json({ ok: true });
}