import { NextResponse } from "next/server";
import { notion, NOTION_DELIVERY_DB_ID } from "@/lib/notion";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = (await notion.databases.retrieve({ database_id: NOTION_DELIVERY_DB_ID })) as any;
    // 生のレスポンスのトップレベルのキーと、propertiesの中身をそのまま返す
    return NextResponse.json({
      topLevelKeys: Object.keys(db),
      hasProperties: !!db.properties,
      propertyKeys: db.properties ? Object.keys(db.properties) : [],
      dataSources: db.data_sources ?? null,
      raw: db,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}