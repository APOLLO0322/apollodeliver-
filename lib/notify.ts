export async function notifyLine(text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_ADMIN_USER_ID;

  if (!token || !to) {
    console.warn("[notifyLine] LINEの環境変数が未設定のためスキップしました");
    return;
  }

  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[notifyLine] 送信失敗 ${res.status}: ${body}`);
    }
  } catch (e) {
    console.error("[notifyLine] 例外:", e);
  }
}
