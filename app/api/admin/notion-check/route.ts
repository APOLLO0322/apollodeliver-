cat > app/api/admin/notion-check/route.ts << 'NOTIONEOF'
import { NextResponse } from "next/server";
import { notion, NOTION_DELIVERY_DB_ID } from "@/lib/notion";

export const runtime = "nodejs";

// Notionとの疎通確認。納品DBのプロパティ一覧と、登録済みページ数を返す。
export async function GET() {
  if (!process.env.NOTION_TOKEN || !NOTION_DELIVERY_DB_ID) {
    return NextResponse.json({ error: "NOTION_TOKEN または NOTION_DELIVERY_DB_ID が未設定です" }, { status: 500 });
  }

  try {
    const db = await notion.databases.retrieve({ database_id: NOTION_DELIVERY_DB_ID });

    const properties = "properties" in db
      ? Object.entries(db.properties).map(([name, def]) => ({ name, type: (def as { type: string }).type }))
      : [];

    const title = "title" in db && Array.isArray(db.title) && db.title[0]
      ? (db.title[0] as { plain_text: string }).plain_text
      : "(無題)";

    return NextResponse.json({
      ok: true,
      databaseTitle: title,
      propertyCount: properties.length,
      properties,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Notionへの接続に失敗しました" },
      { status: 500 }
    );
  }
}
NOTIONEOF