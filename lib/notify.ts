export async function notifyLine(text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const to = process.env.LINE_ADMIN_USER_ID;

  console.log("[notifyLine] token exists:", !!token, "/ to exists:", !!to);

  if (!token || !to) {
    console.warn("[notifyLine] 環境変数が未設定のためスキップしました");
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
    const body = await res.text();
    console.log("[notifyLine] LINE response:", res.status, body);
  } catch (e) {
    console.error("[notifyLine] 例外:", e);
  }
}
