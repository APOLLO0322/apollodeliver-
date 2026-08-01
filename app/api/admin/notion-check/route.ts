import { NextResponse } from "next/server";
import { notion, NOTION_DELIVERY_DB_ID } from "@/lib/notion";

export const runtime = "nodejs";

export async function GET() {
  if (!process.env.NOTION_TOKEN || !NOTION_DELIVERY_DB_ID) {
    return NextResponse.json({ error: "NOTION_TOKEN または NOTION_DELIVERY_DB_ID が未設定です" }, { status: 500 });
  }

  try {
    // 型が複雑なので any で受ける（疎通確認用）
    const db = (await notion.databases.retrieve({ database_id: NOTION_DELIVERY_DB_ID })) as any;

    const properties = Object.entries(db.properties ?? {}).map(
      ([name, def]) => ({ name, type: (def as any).type })
    );

    return NextResponse.json({
      ok: true,
      databaseTitle: db.title?.[0]?.plain_text ?? "(無題)",
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