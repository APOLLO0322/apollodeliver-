import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// 紛らわしい文字(0/o/1/l/i)を除いた読みやすい英数字
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
  } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "案件名を入力してください" }, { status: 400 });
  }
  if (deliveryType !== "review" && deliveryType !== "final") {
    return NextResponse.json({ error: "種別が不正です" }, { status: 400 });
  }

  const linkId = randomString(6); // 例: /d/a7f3k9
  const password = randomString(8); // クライアントに渡す共有パスワード
  const passwordHash = await bcrypt.hash(password, 10);

  const expiresAt =
    typeof deleteAfterDays === "number" && deleteAfterDays > 0
      ? new Date(Date.now() + deleteAfterDays * 86_400_000).toISOString()
      : null;

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
    })
    .select("id, link_id")
    .single();

  if (error) {
    // link_id はごく稀に重複しうる。実運用では重複時リトライを足すと安全。
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    linkId: data.link_id,
    url: `/d/${data.link_id}`,
    password, // 平文はこの1回だけ。DBには保存していない。
  });
}
