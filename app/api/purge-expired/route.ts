import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { deleteR2Keys, listPhotoKeys } from "@/lib/r2-photos";
import { notifyLine } from "@/lib/notify";
import { findUnhandledDeliveries } from "@/lib/notion-delivery";

export const runtime = "nodejs";
export const maxDuration = 60;

// 期限切れ（expires_at を過ぎた）案件の「実ファイル」だけを削除する。
// 案件の行・ログ・超軽量プレビュー(micro_preview)は残し、管理画面で見られる状態を保つ。
// Vercel Cron から毎日呼ばれる。CRON_SECRET で保護。
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 期限切れ かつ まだ実ファイルを消していない（purged_at が空）案件
  const { data: expired, error } = await supabaseAdmin
    .from("projects")
    .select("id, name, expires_at, purged_at")
    .not("expires_at", "is", null)
    .is("purged_at", null)
    .lt("expires_at", new Date().toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!expired || expired.length === 0) {
    return NextResponse.json({ purged: 0, message: "対象の案件はありません" });
  }

  const results: string[] = [];

  for (const project of expired) {
    const { data: assets, error: assetsError } = await supabaseAdmin
      .from("assets")
      .select("id, kind, storage, storage_key, thumb_key")
      .eq("project_id", project.id);

    const photoKeys: string[] = [];
    const thumbKeys: string[] = [];
    const r2Keys: string[] = [];

    for (const a of assets ?? []) {
      if (a.kind === "photo" && a.storage === "r2") {
        if (a.storage_key) r2Keys.push(a.storage_key);
        if (a.thumb_key) r2Keys.push(a.thumb_key);
      } else if (a.kind === "photo") {
        if (a.storage_key) photoKeys.push(a.storage_key);
        if (a.thumb_key) thumbKeys.push(a.thumb_key);
      }
      if (a.kind === "video" && a.storage === "r2" && a.storage_key) {
        r2Keys.push(a.storage_key);
      }
    }

    // 実ファイルを削除（R2 の写真・動画、移行前に Supabase Storage へ入れた写真）
    // 失敗した案件は「削除済み」にせず、翌日もう一度試す
    try {
      if (assetsError) throw assetsError;
      if (photoKeys.length > 0) {
        const { error: e } = await supabaseAdmin.storage.from("photos").remove(photoKeys);
        if (e) throw e;
      }
      if (thumbKeys.length > 0) {
        const { error: e } = await supabaseAdmin.storage.from("thumbnails").remove(thumbKeys);
        if (e) throw e;
      }
      if (r2Keys.length > 0) await deleteR2Keys(r2Keys);
    } catch (e) {
      console.error(`[purge] 削除に失敗したため翌日に再試行 (${project.id}):`, e);
      continue;
    }

    // 途中で止まったアップロードの残りも消す（失敗しても処理は続ける）
    try {
      const leftovers = await listPhotoKeys(project.id);
      if (leftovers.length > 0) await deleteR2Keys(leftovers);
    } catch (e) {
      console.error(`[purge] 残りの写真の確認に失敗 (${project.id}):`, e);
    }

    // assets のファイル参照だけクリア（行と micro_preview は残す）
    await supabaseAdmin
      .from("assets")
      .update({ storage_key: "", thumb_key: null })
      .eq("project_id", project.id);

    // 案件に「削除済み」の印をつける（行は残す）
    await supabaseAdmin
      .from("projects")
      .update({ purged_at: new Date().toISOString() })
      .eq("id", project.id);

    results.push(project.name);
  }

  if (results.length > 0) {
    await notifyLine(
      `🗑 期限切れの納品データを削除しました（${results.length}件）\n${results.join("\n")}\n※プレビューと履歴は管理画面に残っています`
    );
  }

  // 納品期限が近い/過ぎているのにポータル未作成の案件をNotionから探して通知
  try {
    const unhandled = await findUnhandledDeliveries(3);
    if (unhandled.length > 0) {
      const lines = unhandled
        .map((d) => `・${d.name}${d.dueDate ? `（期限 ${d.dueDate}）` : ""}`)
        .join("\n");
      await notifyLine(`⏰ 納品リンク未発行の案件があります（${unhandled.length}件）\n${lines}`);
    }
  } catch (e) {
    console.error("[purge] 未対応通知の取得に失敗:", e);
  }

  return NextResponse.json({ purged: results.length, projects: results });
}