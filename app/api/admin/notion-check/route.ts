import { NextResponse } from "next/server";
import { notion, NOTION_DATA_SOURCE_ID } from "@/lib/notion";

export const runtime = "nodejs";

// データソースからプロパティ一覧を取得して疎通確認する。
export async function GET() {
  if (!process.env.NOTION_TOKEN || !NOTION_DATA_SOURCE_ID) {
    return NextResponse.json({ error: "NOTION_TOKEN または NOTION_DATA_SOURCE_ID が未設定です" }, { status: 500 });
  }
  try {
    // 新API：データソースを取得（ここにプロパティが入っている）
    const ds = (await (notion as any).dataSources.retrieve({ data_source_id: NOTION_DATA_SOURCE_ID })) as any;

    const properties = Object.entries(ds.properties ?? {}).map(
      ([name, def]) => ({ name, type: (def as any).type })
    );

    return NextResponse.json({
      ok: true,
      title: ds.title?.[0]?.plain_text ?? "(無題)",
      propertyCount: properties.length,
      properties,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}