import { NextResponse } from "next/server";
import { notion } from "@/lib/notion";

export const runtime = "nodejs";

// 顧客DBのデータソースIDを調べる。
// ?db=（顧客・案件管理DBのID、URLの?前32文字）を付けて開く。
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const dbId = searchParams.get("db");
  if (!dbId) {
    return NextResponse.json({ error: "?db=（顧客DBのID）を付けてください" }, { status: 400 });
  }
  try {
    const db = (await notion.databases.retrieve({ database_id: dbId })) as any;
    return NextResponse.json({
      title: db.title?.[0]?.plain_text ?? "(無題)",
      dataSources: db.data_sources ?? [],
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}