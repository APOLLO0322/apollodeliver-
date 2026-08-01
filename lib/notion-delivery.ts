import { notion, NOTION_DATA_SOURCE_ID } from "@/lib/notion";

// 種別・ステータスの対応
const TYPE_LABEL = { review: "確認用", final: "納品用" } as const;
const STATUS_LABEL = { review: "確認中", final: "納品済み" } as const;

type CreateArgs = {
  name: string;
  shootDate: string | null;
  deliveryType: "review" | "final";
  chargeAmount?: number | null;
  dueDate?: string | null;      // 納品期限
  portalUrl: string;            // 共有URL
  portalProjectId: string;      // ポータル案件ID
  deleteDate?: string | null;   // 削除予定日
  customerPageId?: string | null; // 顧客リレーション（任意）
};

// Notion納品DBに新規ページを作成する。作成したページIDを返す。
export async function createNotionDelivery(args: CreateArgs): Promise<string> {
  const properties: Record<string, unknown> = {
    "納品件名": { title: [{ text: { content: args.name } }] },
    "種別": { select: { name: TYPE_LABEL[args.deliveryType] } },
    "ステータス": { status: { name: STATUS_LABEL[args.deliveryType] } },
    "ポータルURL": { url: args.portalUrl },
    "ポータル案件ID": { rich_text: [{ text: { content: args.portalProjectId } }] },
    "ポータル作成済み": { checkbox: true },
  };

  if (args.shootDate) properties["撮影日"] = { date: { start: args.shootDate } };
  if (args.dueDate) properties["納品期限"] = { date: { start: args.dueDate } };
  if (args.deleteDate) properties["削除予定日"] = { date: { start: args.deleteDate } };
  if (typeof args.chargeAmount === "number") properties["請求予定金額（税抜）"] = { number: args.chargeAmount };
  if (args.customerPageId) properties["顧客管理"] = { relation: [{ id: args.customerPageId }] };

  const page = await (notion as any).pages.create({
    parent: { type: "data_source_id", data_source_id: NOTION_DATA_SOURCE_ID },
    properties,
  });

  return page.id;
}

// 既存のNotionページのステータスを「納品済み」に更新する（納品リンク発行時）
export async function markNotionDelivered(pageId: string): Promise<void> {
  await (notion as any).pages.update({
    page_id: pageId,
    properties: { "ステータス": { status: { name: "納品済み" } } },
  });
}