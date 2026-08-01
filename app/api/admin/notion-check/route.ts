import { NextResponse } from "next/server";
import { notion, NOTION_DELIVERY_DB_ID } from "@/lib/notion";

export const runtime = "nodejs";

// Notionとの疎通確認。納品DBのプロパティ一覧と、登録済みページ数を返す。
// ブラウザで /api/admin/notion-check を開いて、正しく繋がっているか確認する。
export async function GET() {
  if (!process.env.NOTION_TOKEN || !NOTION_DELIVERY_DB_ID) {
    return NextResponse.json({ error: "NOTION_TOKEN または NOTION_DELIVERY_DB_ID が未設定です" }, { status: 500 });
  }

  try {
    // DBの構造（プロパティ）を取得
    const db = await notion.databases.retrieve({ database_id: NOTION_DELIVERY_DB_ID });

    // @ts-expect-error properties は型が広いので直接読む
    const props = Object.entries(db.properties).map(([name, def]: [string, { type: string }]) => ({
      name,
      type: def.type,
    }));

    // 登録済みページを数件取得（件数確認）
    const query = await notion.databases.query({ database_id: NOTION_DELIVERY_DB_ID, page_size: 5 });

    return NextResponse.json({
      ok: true,
      // @ts-expect-error title は配列
      databaseTitle: db.title?.[0]?.plain_text ?? "(無題)",
      propertyCount: props.length,
      properties: props,
      sampleRowCount: query.results.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Notionへの接続に失敗しました" },
      { status: 500 }
    );
  }
}