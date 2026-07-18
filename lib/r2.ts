import { S3Client } from "@aws-sdk/client-s3";

// Cloudflare R2 は S3 互換なので AWS SDK でそのまま接続できる。
// 認証情報はすべてサーバー専用の環境変数（NEXT_PUBLIC_ を付けない）。
export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET!;