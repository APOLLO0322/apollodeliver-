// ブラウザから署名付きURLへ直接ファイルを送る。失敗したら例外を投げる。
export async function putFile(url: string, body: Blob, label: string): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": body.type || "image/jpeg" },
    body,
  });
  if (!res.ok) throw new Error(`${label}の保存に失敗しました（${res.status}）`);
}
