// 削除後も管理画面で見られるように、超軽量プレビュー（Base64データURL）を生成する。
// 写真：長辺200pxに縮小。動画：最初のフレームを1枚抜いて縮小。
// 返すのは "data:image/jpeg;base64,..." 形式の文字列（DBの micro_preview に保存する）。

const MAX = 200; // 長辺の最大px
const QUALITY = 0.6;

function drawToDataUrl(source: HTMLImageElement | HTMLVideoElement, w: number, h: number): string {
  const scale = Math.min(MAX / w, MAX / h, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", QUALITY);
}

// 写真から超軽量プレビューを作る
export async function microPreviewFromImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("画像の読み込みに失敗"));
      el.src = url;
    });
    return drawToDataUrl(img, img.naturalWidth, img.naturalHeight);
  } catch {
    return "";
  } finally {
    URL.revokeObjectURL(url);
  }
}

// 動画の最初のフレームから超軽量プレビューを作る
export async function microPreviewFromVideo(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("動画の読み込みに失敗"));
    });

    // 最初のフレーム付近（0.1秒）にシークして描画
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = 0.1;
    });

    return drawToDataUrl(video, video.videoWidth, video.videoHeight);
  } catch {
    return "";
  } finally {
    URL.revokeObjectURL(url);
  }
}