import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyLine } from "@/lib/notify";

export const runtime = "nodejs";

// 確認用画面でクライアントが☆を付けて「送信」したときに呼ばれる。
// 選ばれた番号を events に記録し、LINEで番号一覧を通知する。
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { linkId, numbers } = body as { linkId?: string; numbers?: string[] };

  if (!linkId || !Array.isArray(numbers)) {
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

  const sorted = [...numbers].sort();

  await supabaseAdmin.from("events").insert({
    project_id: project.id,
    action: "select_submit",
    meta: { numbers: sorted, count: sorted.length },
  });

  const list = sorted.length > 0 ? sorted.join(", ") : "（選択なし）";
  await notifyLine(
    `${project.name}で写真が選択されました（${sorted.length}点）\n${list}`
  );

  return NextResponse.json({ ok: true, count: sorted.length });
}