// DBに接続できないときだけ使う、動画のみ案件の予備データ。サーバー側専用。
// 環境変数 DELIVERY_FALLBACK に JSON（または base64 にした JSON）を入れておく。
// 公開リポジトリのため、案件名やパスワードのハッシュはコードに書かないこと。

export type FallbackProject = {
  id: string;
  link_id: string;
  name: string;
  shoot_date: string | null;
  delivery_type: "review" | "final";
  select_enabled: boolean;
  password_hash: string;
  expires_at: string | null;
  photo_download_limit: number | null;
  video_download_limit: number | null;
  assets: FallbackAsset[];
};

export type FallbackAsset = {
  id: string;
  kind: "video";
  seq: number;
  storage: "r2";
  storage_key: string;
  thumb_key: null;
  original_filename: string | null;
};

export function findFallbackProject(linkId: string): FallbackProject | null {
  const raw = process.env.DELIVERY_FALLBACK?.trim();
  if (!raw) return null;
  try {
    const json = raw.startsWith("[") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const list = JSON.parse(json) as FallbackProject[];
    return list.find((p) => p.link_id === linkId) ?? null;
  } catch {
    // 中身（ハッシュなど）をログに出さない
    console.error("[fallback] DELIVERY_FALLBACK を読み取れません");
    return null;
  }
}
