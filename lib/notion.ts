import { Client } from "@notionhq/client";

// Notion API クライアント。トークンはサーバー専用の環境変数から読む。
export const notion = new Client({ auth: process.env.NOTION_TOKEN });

export const NOTION_DELIVERY_DB_ID = process.env.NOTION_DELIVERY_DB_ID!;