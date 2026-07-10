import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { notifyLine } from "@/lib/notify";

export const runtime = "nodejs";

// クライアントが共有リンクを開いてパスワードを入れたときに呼ばれる。
// 照合OKなら案件情報＋写真を返す。納品(final)のときは原本DL URLも返す。
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { linkId, password } = body as { linkId?: string; password?: string };

  if (!linkId || !password) {
    return NextResponse.json({ error: "リンクIDとパスワードが必要です" }, { status: 400 });
  }

  const { data: project, error: pErr } = await supabaseAdmin
    .from("projects")
    .select("id, name, shoot_date, delivery_type, select_enabled, password_hash, expires_at")
    .eq("link_id", linkId)
    .single();

  if (pErr || !project) {
    return NextResponse.json({ error: "リンクが見つかりません" }, { status: 404 });
  }

  if (project.expires_at && new Date(project.expires_at) < new Date()) {
    return NextResponse.json({ error: "このリンクは有効期限が切れています" }, { status: 410 });
  }

  const ok = await bcrypt.compare(password, project.password_hash);
  if (!ok) {
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }

  const isFinal = project.delivery_type === "final";

  const { data: assets, error: aErr } = await supabaseAdmin
    .from("assets")
    .select("id, seq, storage_key, thumb_key, original_filename")
    .eq("project_id", project.id)
    .eq("kind", "photo")
    .order("seq", { ascending: true });

  if (aErr) {
    return NextResponse.json({ error: "写真の取得に失敗しました" }, { status: 500 });
  }

  const photos = [];
  for (const a of assets ?? []) {
    const { data: thumb } = await supabaseAdmin.storage
      .from("thumbnails")
      .createSignedUrl(a.thumb_key, 3600);

    let downloadUrl: string | null = null;
    if (isFinal) {
      const { data: orig } = await supabaseAdmin.storage
        .from("photos")
        .createSignedUrl(a.storage_key, 3600, {
          download: a.original_filename ?? `${String(a.seq).padStart(3, "0")}.jpg`,
        });
      downloadUrl = orig?.signedUrl ?? null;
    }

    photos.push({
      id: a.id,
      seq: a.seq,
      url: thumb?.signedUrl ?? null,
      downloadUrl,
      filename: a.original_filename ?? `${String(a.seq).padStart(3, "0")}.jpg`,
    });
  }

  // 閲覧イベントを記録
  await supabaseAdmin.from("events").insert({
    project_id: project.id,
    action: "view",
    meta: {},
  });

  // LINE通知（閲覧された）
  const label = isFinal ? "納品" : "確認用";
  await notifyLine(`📂 ${project.name}（${label}）が開かれました`);

  return NextResponse.json({
    name: project.name,
    shootDate: project.shoot_date,
    deliveryType: project.delivery_type,
    selectEnabled: project.select_enabled,
    photos,
  });
}