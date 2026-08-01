import { NextResponse } from "next/server";
import { findUnhandledDeliveries } from "@/lib/notion-delivery";
import { notifyLine } from "@/lib/notify";

export const runtime = "nodejs";

// 未対応案件通知の手動テスト用。開くと今の未対応案件を返し、あればLINEにも送る。
export async function GET() {
  try {
    const unhandled = await findUnhandledDeliveries(3);
    if (unhandled.length > 0) {
      const lines = unhandled
        .map((d) => `・${d.name}${d.dueDate ? `（期限 ${d.dueDate}）` : ""}`)
        .join("\n");
      await notifyLine(`⏰ 納品リンク未発行の案件があります（${unhandled.length}件）\n${lines}`);
    }
    return NextResponse.json({ count: unhandled.length, unhandled });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}