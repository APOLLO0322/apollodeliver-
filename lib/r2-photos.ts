import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKET } from "@/lib/r2";

// 写真のR2保存まわり。サーバー側専用。
// キー: {projectId}/photos/001.jpg（原本） / {projectId}/thumbs/001.jpg（軽量版）

export function photoKeys(projectId: string, seq: number) {
  const name = `${String(seq).padStart(3, "0")}.jpg`;
  return {
    originalKey: `${projectId}/photos/${name}`,
    thumbKey: `${projectId}/thumbs/${name}`,
  };
}

// 枚数が多いとアップロードに時間がかかるため、URLは2時間有効にする
export function signPhotoPut(key: string): Promise<string> {
  return getSignedUrl(r2, new PutObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn: 7200 });
}

export function signPhotoGet(key: string, downloadName?: string): Promise<string> {
  return getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ResponseContentDisposition: downloadName
        ? `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
        : undefined,
    }),
    { expiresIn: 3600 }
  );
}

// 1件でも失敗したら例外を投げる（呼び出し側で「削除済み」にしないため）
export async function deleteR2Keys(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) {
    const res = await r2.send(
      new DeleteObjectsCommand({
        Bucket: R2_BUCKET,
        Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })) },
      })
    );
    if (res.Errors?.length) {
      throw new Error(`R2の削除に失敗: ${res.Errors.length}件 (${res.Errors[0].Code})`);
    }
  }
}

// 途中で止まったアップロードなど、DBに記録のない写真も含めて一覧にする
export async function listPhotoKeys(projectId: string): Promise<string[]> {
  if (!projectId) return [];
  const keys: string[] = [];
  for (const dir of ["photos", "thumbs"]) {
    let token: string | undefined;
    do {
      const res = await r2.send(
        new ListObjectsV2Command({
          Bucket: R2_BUCKET,
          Prefix: `${projectId}/${dir}/`,
          ContinuationToken: token,
        })
      );
      for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
  }
  return keys;
}
