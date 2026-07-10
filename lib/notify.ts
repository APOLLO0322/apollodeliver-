import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyLine } from "@/lib/notify";

export const runtime = "nodejs";

// クライアントが写真をダウンロードしたときに呼ばれる。
// kind = "bulk"（一括ZIP）: 必ず通知
// kind = "single"（個別）: その案件で初回のときだけ通知
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { linkId, kind, count } = body as {
    linkId?: string;
    kind?: "bulk" | "single";
    count?: number;
  };

  if (!linkId || (kind !== "bulk" && kind !== "single")) {
    return NextResponse.json({ error: "パラメータが不正です" }, { status: 400 });
  }

  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id, name")
    .eq("link_id", linkId)
    .single();

  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  // ダウンロードイベントを記録（通知の有無に関わらず必ず残す）
  await supabaseAdmin.from("events").insert({
    project_id: project.id,
    action: "download",
    meta: { kind, count: count ?? null },
  });

  if (kind === "bulk") {
    // 一括：必ず通知
    await notifyLine(`${project.name}の写真が一括ダウンロードされました`);
  } else {
    // 個別：この案件で「個別DLの通知」がまだ無いときだけ通知
    const { count: prevSingle } = await supabaseAdmin
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id)
      .eq("action", "download")
      .filter("meta->>kind", "eq", "single");

    // 今回の1件も含まれるので、1件（＝初回）のときだけ通知
    if ((prevSingle ?? 0) <= 1) {
      await notifyLine(`${project.name}の写真が個別でダウンロードされました`);
    }
  }

  return NextResponse.json({ ok: true });
}