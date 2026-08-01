import { NextResponse } from "next/server";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { r2, R2_BUCKET } from "@/lib/r2";
import { notifyLine } from "@/lib/notify";

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
    const { data: assets } = await supabaseAdmin
      .from("assets")
      .select("id, kind, storage, storage_key, thumb_key")
      .eq("project_id", project.id);

    const photoKeys: string[] = [];
    const thumbKeys: string[] = [];
    const videoKeys: string[] = [];

    for (const a of assets ?? []) {
      if (a.kind === "photo") {
        if (a.storage_key) photoKeys.push(a.storage_key);
        if (a.thumb_key) thumbKeys.push(a.thumb_key);
      }
      if (a.kind === "video" && a.storage === "r2" && a.storage_key) {
        videoKeys.push(a.storage_key);
      }
    }

    // 実ファイルを削除（Supabase Storage の写真原本・軽量版、R2 の動画）
    if (photoKeys.length > 0) await supabaseAdmin.storage.from("photos").remove(photoKeys);
    if (thumbKeys.length > 0) await supabaseAdmin.storage.from("thumbnails").remove(thumbKeys);
    if (videoKeys.length > 0) {
      try {
        await r2.send(new DeleteObjectsCommand({
          Bucket: R2_BUCKET,
          Delete: { Objects: videoKeys.map((Key) => ({ Key })) },
        }));
      } catch (e) {
        console.error(`[purge] R2削除に失敗 (${project.name}):`, e);
      }
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

  return NextResponse.json({ purged: results.length, projects: results });
}