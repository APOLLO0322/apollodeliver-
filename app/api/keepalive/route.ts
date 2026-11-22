import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

// Supabase 無料枠の自動休止（約1週間アクセスなしで停止）を防ぐため、
// Vercel Cron から毎日呼ばれて DB に軽くアクセスする。CRON_SECRET で保護。
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { error } = await supabaseAdmin
    .from("projects")
    .select("id", { head: true, count: "exact" })
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
