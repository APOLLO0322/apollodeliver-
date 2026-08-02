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

// 納品期限が近い/過ぎている かつ ポータル未作成 の案件を探す（未対応通知用）
export async function findUnhandledDeliveries(withinDays = 3): Promise<
  { name: string; dueDate: string | null }[]
> {
  const limit = new Date();
  limit.setDate(limit.getDate() + withinDays);
  const limitStr = limit.toISOString().slice(0, 10);

  const res = await (notion as any).dataSources.query({
    data_source_id: NOTION_DATA_SOURCE_ID,
    filter: {
      and: [
        { property: "ポータル作成済み", checkbox: { equals: false } },
        { property: "納品期限", date: { on_or_before: limitStr } },
      ],
    },
  });

  return res.results.map((page: any) => {
    const titleProp = page.properties?.["納品件名"]?.title;
    const dueProp = page.properties?.["納品期限"]?.date;
    return {
      name: titleProp?.[0]?.plain_text ?? "(無題)",
      dueDate: dueProp?.start ?? null,
    };
  });
}

// 顧客一覧を取得（フォームのプルダウン用）。タイトル列名は「顧客名」想定。
export async function listCustomers(): Promise<{ id: string; name: string }[]> {
  const dsId = process.env.NOTION_CUSTOMER_DATA_SOURCE_ID!;
const res = await (notion as any).dataSources.query({
    data_source_id: dsId,
    page_size: 100,
    filter: {
      property: "ステータス",
      status: { does_not_equal: "終了・休眠" },
    },
  });
  return res.results
    .map((page: any) => {
      // タイトル型のプロパティを自動で探す（列名に依存しない）
      const props = page.properties ?? {};
      const titleKey = Object.keys(props).find((k) => props[k]?.type === "title");
      const name = titleKey ? props[titleKey].title?.[0]?.plain_text : "";
      return { id: page.id, name: name ?? "(無名)" };
    })
    .filter((c: { name: string }) => c.name && c.name !== "(無名)");
}

// ポータル未作成の納品案件一覧を取得（②既存を選んで納品 用）
export async function listUncreatedDeliveries(): Promise<
  { pageId: string; name: string; shootDate: string | null; deliveryType: "review" | "final" | null; dueDate: string | null; chargeAmount: number | null }[]
> {
  const res = await (notion as any).dataSources.query({
    data_source_id: NOTION_DATA_SOURCE_ID,
    filter: { property: "ポータル作成済み", checkbox: { equals: false } },
    page_size: 100,
  });
  return res.results.map((page: any) => {
    const p = page.properties ?? {};
    const typeName = p["種別"]?.select?.name;
    const deliveryType = typeName === "納品用" ? "final" : typeName === "確認用" ? "review" : null;
    return {
      pageId: page.id,
      name: p["納品件名"]?.title?.[0]?.plain_text ?? "(無題)",
      shootDate: p["撮影日"]?.date?.start ?? null,
      deliveryType,
      dueDate: p["納品期限"]?.date?.start ?? null,
      chargeAmount: p["請求予定金額（税抜）"]?.number ?? null,
    };
  });
}

// 既存のNotionページに、ポータル作成の結果を書き戻す（②既存を選んで納品）
export async function updateNotionDeliveryOnCreate(args: {
  pageId: string;
  deliveryType: "review" | "final";
  portalUrl: string;
  portalProjectId: string;
  deleteDate?: string | null;
}): Promise<void> {
  const properties: Record<string, unknown> = {
    "ステータス": { status: { name: args.deliveryType === "final" ? "納品済み" : "確認中" } },
    "ポータルURL": { url: args.portalUrl },
    "ポータル案件ID": { rich_text: [{ text: { content: args.portalProjectId } }] },
    "ポータル作成済み": { checkbox: true },
  };
  if (args.deleteDate) properties["削除予定日"] = { date: { start: args.deleteDate } };

  await (notion as any).pages.update({ page_id: args.pageId, properties });
}