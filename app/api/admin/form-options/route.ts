import { NextResponse } from "next/server";
import { listCustomers, listUncreatedDeliveries } from "@/lib/notion-delivery";

export const runtime = "nodejs";

// フォームのプルダウン用データ。顧客一覧と、ポータル未作成の納品案件一覧。
export async function GET() {
  try {
    const [customers, uncreated] = await Promise.all([
      listCustomers().catch(() => []),
      listUncreatedDeliveries().catch(() => []),
    ]);
    return NextResponse.json({ customers, uncreated });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}