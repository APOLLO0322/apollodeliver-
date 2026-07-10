import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// クライアントが共有リンクを開いてパスワードを入れたときに呼ばれる。
// 照合OKなら案件情報＋写真（軽量版の署名付きURL）を返す。
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { linkId, password } = body as { linkId?: string; password?: string };

  if (!linkId || !password) {
    return NextResponse.json({ error: "リンクIDとパスワードが必要です" }, { status: 400 });
  }

  // 案件を取得
  const { data: project, error: pErr } = await supabaseAdmin
    .from("projects")
    .select("id, name, shoot_date, delivery_type, select_enabled, password_hash, expires_at")
    .eq("link_id", linkId)
    .single();

  if (pErr || !project) {
    return NextResponse.json({ error: "リンクが見つかりません" }, { status: 404 });
  }

  // 有効期限切れチェック
  if (project.expires_at && new Date(project.expires_at) < new Date()) {
    return NextResponse.json({ error: "このリンクは有効期限が切れています" }, { status: 410 });
  }

  // パスワード照合
  const ok = await bcrypt.compare(password, project.password_hash);
  if (!ok) {
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }

  // 写真を取得（seq順）
  const { data: assets, error: aErr } = await supabaseAdmin
    .from("assets")
    .select("id, seq, storage_key, thumb_key")
    .eq("project_id", project.id)
    .eq("kind", "photo")
    .order("seq", { ascending: true });

  if (aErr) {
    return NextResponse.json({ error: "写真の取得に失敗しました" }, { status: 500 });
  }

  // 軽量版の署名付き表示URLを発行（1時間有効）
  const photos = [];
  for (const a of assets ?? []) {
    const { data: signed } = await supabaseAdmin.storage
      .from("thumbnails")
      .createSignedUrl(a.thumb_key, 3600);
    photos.push({
      id: a.id,
      seq: a.seq,
      url: signed?.signedUrl ?? null,
    });
  }

  // 閲覧イベントを記録
  await supabaseAdmin.from("events").insert({
    project_id: project.id,
    action: "view",
    meta: {},
  });

  return NextResponse.json({
    name: project.name,
    shootDate: project.shoot_date,
    deliveryType: project.delivery_type,
    selectEnabled: project.select_enabled,
    photos,
  });
}
