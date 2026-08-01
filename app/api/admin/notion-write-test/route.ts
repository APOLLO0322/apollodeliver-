import { NextResponse } from "next/server";
import { createNotionDelivery } from "@/lib/notion-delivery";

export const runtime = "nodejs";

// Notionへの書き込み確認用。ブラウザで開くとテスト行が1件作られる。
// 確認後はこのファイルを削除する。
export async function GET() {
  try {
    const pageId = await createNotionDelivery({
      name: "書き込みテスト（削除OK）",
      shootDate: "2026-08-01",
      deliveryType: "review",
      chargeAmount: 50000,
      dueDate: "2026-08-10",
      portalUrl: "https://apollodeliver.vercel.app/d/testtest",
      portalProjectId: "test-project-id",
      deleteDate: "2026-09-01",
    });
    return NextResponse.json({ ok: true, createdPageId: pageId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}