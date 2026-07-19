import { NextResponse } from "next/server";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { r2, R2_BUCKET } from "@/lib/r2";
import { notifyLine } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 60;

// 期限切れ（expires_at を過ぎた）案件を掃除する。
// Vercel Cron から毎日呼ばれる。手動で叩かれないよう CRON_SECRET で保護。
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 期限切れの案件を取得
  const { data: expired, error } = await supabaseAdmin
    .from("projects")
    .select("id, name, expires_at")
    .not("expires_at", "is", null)
    .lt("expires_at", new Date().toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!expired || expired.length === 0) {
    return NextResponse.json({ purged: 0, message: "期限切れの案件はありません" });
  }

  const results: string[] = [];

  for (const project of expired) {
    // この案件のファイル一覧
    const { data: assets } = await supabaseAdmin
      .from("assets")
      .select("kind, storage, storage_key, thumb_key")
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

    // Supabase Storage（写真の原本・軽量版）を削除
    if (photoKeys.length > 0) {
      await supabaseAdmin.storage.from("photos").remove(photoKeys);
    }
    if (thumbKeys.length > 0) {
      await supabaseAdmin.storage.from("thumbnails").remove(thumbKeys);
    }

    // R2（動画）を削除
    if (videoKeys.length > 0) {
      try {
        await r2.send(
          new DeleteObjectsCommand({
            Bucket: R2_BUCKET,
            Delete: { Objects: videoKeys.map((Key) => ({ Key })) },
          })
        );
      } catch (e) {
        console.error(`[purge] R2削除に失敗 (${project.name}):`, e);
      }
    }

    // DBの行を削除（assets と events は cascade で一緒に消える）
    await supabaseAdmin.from("projects").delete().eq("id", project.id);

    results.push(project.name);
  }

  if (results.length > 0) {
    await notifyLine(
      `🗑 期限切れの納品を自動削除しました（${results.length}件）\n${results.join("\n")}`
    );
  }

  return NextResponse.json({ purged: results.length, projects: results });
}