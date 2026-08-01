import { Client } from "@notionhq/client";

// Notion API クライアント。トークンはサーバー専用の環境変数から読む。
export const notion = new Client({ auth: process.env.NOTION_TOKEN });

// 新しいNotion APIでは、DBの下に「データソース」があり、
// プロパティの読み書き・ページ作成・クエリはデータソースIDに対して行う。
export const NOTION_DELIVERY_DB_ID = process.env.NOTION_DELIVERY_DB_ID!;
export const NOTION_DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID!;
export const NOTION_CUSTOMER_DATA_SOURCE_ID = process.env.NOTION_CUSTOMER_DATA_SOURCE_ID!;