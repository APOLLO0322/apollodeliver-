import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createNotionDelivery, updateNotionDeliveryOnCreate } from "@/lib/notion-delivery";

export const runtime = "nodejs";

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

function randomString(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    name,
    shootDate,
    deliveryType = "review",
    selectEnabled = false,
    deleteAfterDays,
    dueDate,        // 納品期限（任意）
    chargeAmount,   // 請求予定金額（任意）
    customerPageId, // 顧客リレーション（任意）
    existingNotionPageId, // 既存Notion案件から作る場合のページID
    photoDownloadLimit, // 写真のDL数制限（null=無制限）
    videoDownloadLimit, // 動画のDL数制限（null=無制限）
  } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "案件名を入力してください" }, { status: 400 });
  }
  if (deliveryType !== "review" && deliveryType !== "final") {
    return NextResponse.json({ error: "種別が不正です" }, { status: 400 });
  }

  const linkId = randomString(6);
  const password = randomString(8);
  const passwordHash = await bcrypt.hash(password, 10);

  const expiresAt =
    typeof deleteAfterDays === "number" && deleteAfterDays > 0
      ? new Date(Date.now() + deleteAfterDays * 86_400_000).toISOString()
      : null;

  // 1. ポータルに案件を作成
  const { data, error } = await supabaseAdmin
    .from("projects")
    .insert({
      link_id: linkId,
      name,
      shoot_date: shootDate || null,
      delivery_type: deliveryType,
      select_enabled: selectEnabled,
      password_hash: passwordHash,
      expires_at: expiresAt,
      photo_download_limit: typeof photoDownloadLimit === "number" && photoDownloadLimit > 0 ? photoDownloadLimit : null,
      video_download_limit: typeof videoDownloadLimit === "number" && videoDownloadLimit > 0 ? videoDownloadLimit : null,
    })
    .select("id, link_id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://apollodeliver.vercel.app";
  const portalUrl = `${baseUrl}/d/${data.link_id}`;

  // 2. Notionへの書き込み（失敗しても案件作成自体は成功扱い）
  let notionPageId: string | null = null;
  let notionError: string | null = null;
  const deleteDate = expiresAt ? expiresAt.slice(0, 10) : null;
  try {
    if (existingNotionPageId) {
      // 既存Notion案件から作成 → そのページに書き戻す
      await updateNotionDeliveryOnCreate({
        pageId: existingNotionPageId,
        deliveryType,
        portalUrl,
        portalProjectId: data.id,
        deleteDate,
      });
      notionPageId = existingNotionPageId;
    } else {
      // 新規作成 → Notionに新しいページを作る
      notionPageId = await createNotionDelivery({
        name,
        shootDate: shootDate || null,
        deliveryType,
        chargeAmount: typeof chargeAmount === "number" ? chargeAmount : null,
        dueDate: dueDate || null,
        portalUrl,
        portalProjectId: data.id,
        deleteDate,
        customerPageId: customerPageId || null,
      });
    }
    await supabaseAdmin.from("projects").update({ notion_page_id: notionPageId }).eq("id", data.id);
  } catch (e) {
    notionError = e instanceof Error ? e.message : String(e);
    console.error("[projects] Notion書き込み失敗:", notionError);
  }

  return NextResponse.json({
    id: data.id,
    linkId: data.link_id,
    url: `/d/${data.link_id}`,
    password,
    notionSynced: !!notionPageId,
    notionError, // 失敗時に画面で知らせる
  });
}