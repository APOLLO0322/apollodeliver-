"use client";

import { useState, useRef, type CSSProperties } from "react";
import imageCompression from "browser-image-compression";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Created = { id: string; url: string; password: string; linkId: string };
type UploadState = "idle" | "uploading" | "done";

export default function NewDeliveryPage() {
  const [name, setName] = useState("");
  const [shootDate, setShootDate] = useState("");
  const [deliveryType, setDeliveryType] = useState<"review" | "final">("review");
  const [selectEnabled, setSelectEnabled] = useState(false);
  const [deleteAfterDays, setDeleteAfterDays] = useState(30);

  const [creating, setCreating] = useState(false);
  const [project, setProject] = useState<Created | null>(null);

  // 写真
  const [photoState, setPhotoState] = useState<UploadState>("idle");
  const [photoProgress, setPhotoProgress] = useState({ done: 0, total: 0 });
  const [photoCount, setPhotoCount] = useState(0);
  const [photoDrag, setPhotoDrag] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  // 動画
  const [videoState, setVideoState] = useState<UploadState>("idle");
  const [videoProgress, setVideoProgress] = useState(0); // 0-100
  const [videoCount, setVideoCount] = useState(0);
  const [videoDrag, setVideoDrag] = useState(false);
  const videoInput = useRef<HTMLInputElement>(null);

  async function createProject() {
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, shootDate: shootDate || null, deliveryType, selectEnabled, deleteAfterDays }),
      });
      const data = await res.json();
      if (res.ok) setProject(data);
      else alert(data.error ?? "作成に失敗しました");
    } finally {
      setCreating(false);
    }
  }

  // 写真アップロード（ブラウザ → Supabase）
  async function uploadPhotos(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !project) return;
    const photos = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (photos.length === 0) return;

    setPhotoState("uploading");
    setPhotoProgress({ done: 0, total: photos.length });
    try {
      const urlRes = await fetch("/api/upload-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, count: photos.length }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error ?? "URL発行に失敗");
      const slots = urlData.slots as {
        seq: number; originalKey: string; thumbKey: string;
        originalUpload: { token: string; path: string };
        thumbUpload: { token: string; path: string };
      }[];

      const recorded: { seq: number; originalKey: string; thumbKey: string; originalFilename: string; sizeBytes: number; }[] = [];
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i];
        const slot = slots[i];
        const thumb = await imageCompression(file, { maxWidthOrHeight: 2000, maxSizeMB: 1.5, useWebWorker: true, fileType: "image/jpeg" });
        const up1 = await supabaseBrowser.storage.from("photos").uploadToSignedUrl(slot.originalUpload.path, slot.originalUpload.token, file);
        if (up1.error) throw new Error(`原本の保存に失敗: ${up1.error.message}`);
        const up2 = await supabaseBrowser.storage.from("thumbnails").uploadToSignedUrl(slot.thumbUpload.path, slot.thumbUpload.token, thumb);
        if (up2.error) throw new Error(`軽量版の保存に失敗: ${up2.error.message}`);
        recorded.push({ seq: slot.seq, originalKey: slot.originalKey, thumbKey: slot.thumbKey, originalFilename: file.name, sizeBytes: file.size });
        setPhotoProgress({ done: i + 1, total: photos.length });
      }
      const doneRes = await fetch("/api/upload-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, items: recorded }),
      });
      const doneData = await doneRes.json();
      if (!doneRes.ok) throw new Error(doneData.error ?? "記録に失敗");
      setPhotoCount((c) => c + recorded.length);
      setPhotoState("done");
    } catch (e) {
      alert(e instanceof Error ? e.message : "写真のアップロードに失敗しました");
      setPhotoState("idle");
    }
  }

  // 動画アップロード（ブラウザ → R2 に直接 PUT）
  async function uploadVideos(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || !project) return;
    const videos = Array.from(fileList).filter((f) => f.type.startsWith("video/"));
    if (videos.length === 0) {
      alert("動画ファイルを入れてください");
      return;
    }
    setVideoState("uploading");
    try {
      for (const file of videos) {
        // ① 署名付きアップロードURLを取得
        const urlRes = await fetch("/api/video-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: project.id, filename: file.name, contentType: file.type }),
        });
        const urlData = await urlRes.json();
        if (!urlRes.ok) throw new Error(urlData.error ?? "URL発行に失敗");

        // ② R2へ直接PUT（進捗つき）
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", urlData.uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setVideoProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`アップロード失敗 ${xhr.status}`)));
          xhr.onerror = () => reject(new Error("アップロード中に通信エラー"));
          xhr.send(file);
        });

        // ③ 記録
        const doneRes = await fetch("/api/video-upload-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: project.id, seq: urlData.seq, key: urlData.key, filename: file.name, sizeBytes: file.size }),
        });
        const doneData = await doneRes.json();
        if (!doneRes.ok) throw new Error(doneData.error ?? "記録に失敗");
        setVideoCount((c) => c + 1);
      }
      setVideoProgress(0);
      setVideoState("done");
    } catch (e) {
      alert(e instanceof Error ? e.message : "動画のアップロードに失敗しました");
      setVideoState("idle");
      setVideoProgress(0);
    }
  }

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? (typeof window !== "undefined" ? window.location.origin : "");
  const fullUrl = project ? `${base}${project.url}` : "";

  return (
    <main style={S.page}>
      <div style={S.card}>
        <h1 style={S.h1}>新規納品を作成</h1>

        <label style={S.label}>案件名</label>
        <input style={S.input} value={name} disabled={!!project} onChange={(e) => setName(e.target.value)} placeholder="cafe LOTUS 秋メニュー撮影" />

        <div style={S.row}>
          <div>
            <label style={S.label}>撮影日</label>
            <input style={{ ...S.input, width: 150 }} type="date" value={shootDate} disabled={!!project} onChange={(e) => setShootDate(e.target.value)} />
          </div>
          <div>
            <label style={S.label}>種別</label>
            <div style={S.seg}>
              <button style={deliveryType === "review" ? S.segOn : S.segOff} disabled={!!project} onClick={() => setDeliveryType("review")}>確認用</button>
              <button style={deliveryType === "final" ? S.segOn : S.segOff} disabled={!!project} onClick={() => setDeliveryType("final")}>納品</button>
            </div>
          </div>
          <div>
            <label style={S.label}>自動削除</label>
            <select style={{ ...S.input, width: 120 }} value={deleteAfterDays} disabled={!!project} onChange={(e) => setDeleteAfterDays(Number(e.target.value))}>
              <option value={30}>30日後</option>
              <option value={14}>14日後</option>
              <option value={7}>7日後</option>
              <option value={0}>なし</option>
            </select>
          </div>
        </div>

        {deliveryType === "review" && !project && (
          <label style={S.check}>
            <input type="checkbox" checked={selectEnabled} onChange={(e) => setSelectEnabled(e.target.checked)} />
            写真のセレクト機能（☆）を使う
          </label>
        )}

        {!project && (
          <button style={S.primary} onClick={createProject} disabled={creating || !name}>
            {creating ? "作成中…" : "案件を作成"}
          </button>
        )}

        {project && (
          <>
            {/* 写真ドロップゾーン */}
            <p style={S.sectionLabel}>写真</p>
            <div
              style={{ ...S.drop, ...(photoDrag ? S.dropOver : {}), ...(photoState === "uploading" ? S.dropBusy : {}) }}
              onDragOver={(e) => { e.preventDefault(); if (photoState !== "uploading") setPhotoDrag(true); }}
              onDragLeave={() => setPhotoDrag(false)}
              onDrop={(e) => { e.preventDefault(); setPhotoDrag(false); if (photoState !== "uploading") uploadPhotos(e.dataTransfer.files); }}
              onClick={() => photoState !== "uploading" && photoInput.current?.click()}
            >
              <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(e) => uploadPhotos(e.target.files)} />
              {photoState === "uploading"
                ? <p style={S.dropText}>アップロード中… {photoProgress.done} / {photoProgress.total}枚</p>
                : <><p style={S.dropText}>写真をドラッグ、またはクリックして選択</p><p style={S.dropSub}>原本を保存し、確認用の軽量版を自動生成します</p></>}
            </div>
            {photoCount > 0 && <p style={S.uploaded}>✓ 写真 {photoCount}枚をアップロード済み</p>}

            {/* 動画ドロップゾーン */}
            <p style={S.sectionLabel}>動画</p>
            <div
              style={{ ...S.drop, ...(videoDrag ? S.dropOver : {}), ...(videoState === "uploading" ? S.dropBusy : {}) }}
              onDragOver={(e) => { e.preventDefault(); if (videoState !== "uploading") setVideoDrag(true); }}
              onDragLeave={() => setVideoDrag(false)}
              onDrop={(e) => { e.preventDefault(); setVideoDrag(false); if (videoState !== "uploading") uploadVideos(e.dataTransfer.files); }}
              onClick={() => videoState !== "uploading" && videoInput.current?.click()}
            >
              <input ref={videoInput} type="file" accept="video/*" multiple hidden onChange={(e) => uploadVideos(e.target.files)} />
              {videoState === "uploading"
                ? <p style={S.dropText}>アップロード中… {videoProgress}%</p>
                : <><p style={S.dropText}>動画をドラッグ、またはクリックして選択</p><p style={S.dropSub}>R2に保存します（大容量もそのままOK）</p></>}
            </div>
            {videoCount > 0 && <p style={S.uploaded}>✓ 動画 {videoCount}本をアップロード済み</p>}

            {/* 共有リンク */}
            <div style={S.result}>
              <p style={S.resultLabel}>共有リンク</p>
              <div style={S.resultRow}>
                <input style={S.mono} readOnly value={fullUrl} />
                <button style={S.ghost} onClick={() => navigator.clipboard.writeText(fullUrl)}>コピー</button>
              </div>
              <div style={S.resultRow}>
                <input style={S.mono} readOnly value={`パスワード ${project.password}`} />
                <button style={S.ghost} onClick={() => navigator.clipboard.writeText(project.password)}>コピー</button>
              </div>
              <p style={S.hint}>パスワードはこの画面でしか確認できません。控えてからクライアントに渡してください。</p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#fafafa", padding: "48px 16px", display: "flex", justifyContent: "center" },
  card: { width: "100%", maxWidth: 560, background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "32px 28px" },
  h1: { fontSize: 20, fontWeight: 500, margin: "0 0 24px", letterSpacing: "0.02em" },
  label: { display: "block", fontSize: 13, color: "#888", margin: "0 0 6px" },
  input: { width: "100%", height: 38, border: "0.5px solid #e5e5e5", borderRadius: 8, padding: "0 12px", fontSize: 14, boxSizing: "border-box", marginBottom: 16, background: "#fff" },
  row: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" },
  seg: { display: "inline-flex", border: "0.5px solid #e5e5e5", borderRadius: 8, overflow: "hidden", marginBottom: 16 },
  segOn: { border: "none", background: "#1a1a1a", color: "#fff", fontSize: 13, fontWeight: 500, padding: "0 16px", height: 38, cursor: "pointer" },
  segOff: { border: "none", background: "#fff", color: "#666", fontSize: 13, padding: "0 16px", height: 38, cursor: "pointer" },
  check: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#555", margin: "0 0 20px" },
  primary: { width: "100%", height: 44, background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer" },
  sectionLabel: { fontSize: 12, letterSpacing: "0.12em", color: "#999", margin: "20px 0 8px" },
  drop: { border: "1.5px dashed #d4d4d4", borderRadius: 12, background: "#fafafa", padding: "24px", textAlign: "center", cursor: "pointer" },
  dropOver: { borderColor: "#1a1a1a", background: "#f0f0f0" },
  dropBusy: { cursor: "default", opacity: 0.7 },
  dropText: { fontSize: 14, color: "#333", margin: 0 },
  dropSub: { fontSize: 12, color: "#999", margin: "6px 0 0" },
  uploaded: { fontSize: 13, color: "#555", margin: "10px 0 0" },
  result: { marginTop: 24, padding: 16, background: "#fafafa", border: "0.5px solid #e5e5e5", borderRadius: 12 },
  resultLabel: { fontSize: 12, letterSpacing: "0.1em", color: "#888", margin: "0 0 10px" },
  resultRow: { display: "flex", gap: 8, marginBottom: 8 },
  mono: { flex: 1, height: 38, border: "0.5px solid #e5e5e5", borderRadius: 8, padding: "0 12px", fontSize: 13, fontFamily: mono, background: "#fff", boxSizing: "border-box" },
  ghost: { height: 38, padding: "0 14px", background: "#fff", border: "0.5px solid #d4d4d4", borderRadius: 8, fontSize: 13, color: "#555", cursor: "pointer", whiteSpace: "nowrap" },
  hint: { fontSize: 12, color: "#999", margin: "8px 0 0", lineHeight: 1.6 },
};