import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

function randomString(len: number): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// パスワードを再発行する（元のパスワードはハッシュ保存のため復元不可）。
// 再発行すると古いパスワードは無効になる。
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { id } = body as { id?: string };
  if (!id) {
    return NextResponse.json({ error: "id が必要です" }, { status: 400 });
  }

  const password = randomString(8);
  const passwordHash = await bcrypt.hash(password, 10);

  const { error } = await supabaseAdmin
    .from("projects")
    .update({ password_hash: passwordHash })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ password });
}