"use client";

import { useState, useEffect, useRef, use, type CSSProperties } from "react";
import Link from "next/link";
import imageCompression from "browser-image-compression";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Project = {
  id: string; link_id: string; name: string; shoot_date: string | null;
  delivery_type: "review" | "final"; select_enabled: boolean;
  expires_at: string | null; created_at: string;
};
type Ev = { id: string; action: string; meta: Record<string, unknown>; occurred_at: string };
type PPhoto = { id: string; seq: number; url: string | null; downloadUrl: string | null; filename: string };
type PVideo = { id: string; seq: number; playUrl: string; downloadUrl: string; filename: string };

const ACTION_LABEL: Record<string, string> = {
  view: "ページを開いた",
  play: "動画を再生",
  download: "ダウンロード",
  select_submit: "写真を選択して送信",
};

export default function AdminDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [videoCount, setVideoCount] = useState(0);
  const [events, setEvents] = useState<Ev[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [pPhotos, setPPhotos] = useState<PPhoto[]>([]);
  const [pVideos, setPVideos] = useState<PVideo[]>([]);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const [photoState, setPhotoState] = useState<"idle" | "uploading">("idle");
  const [photoProgress, setPhotoProgress] = useState({ done: 0, total: 0 });
  const [videoState, setVideoState] = useState<"idle" | "uploading">("idle");
  const [videoProgress, setVideoProgress] = useState(0);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  function load() {
    fetch(`/api/admin/project?id=${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.project) {
          setProject(d.project);
          setPhotoCount(d.photoCount ?? 0);
          setVideoCount(d.videoCount ?? 0);
          setEvents(d.events ?? []);
        }
      })
      .finally(() => setLoading(false));

    fetch(`/api/admin/assets?id=${id}`)
      .then((r) => r.json())
      .then((d) => {
        setPPhotos(d.photos ?? []);
        setPVideos(d.videos ?? []);
      })
      .catch(() => {});
  }
  useEffect(load, [id]);

  // ライトボックスのキー操作
  useEffect(() => {
    if (lightbox === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightbox(null);
      if (e.key === "ArrowLeft") setLightbox((i) => (i === null ? i : (i - 1 + pPhotos.length) % pPhotos.length));
      if (e.key === "ArrowRight") setLightbox((i) => (i === null ? i : (i + 1) % pPhotos.length));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, pPhotos.length]);

  function saveFile(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function regenerate() {
    if (!confirm("パスワードを再発行しますか？古いパスワードは使えなくなります。")) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/admin/regenerate-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await res.json();
      if (res.ok) setNewPassword(d.password);
      else alert(d.error ?? "再発行に失敗しました");
    } finally {
      setRegenerating(false);
    }
  }

  async function uploadPhotos(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const photos = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (photos.length === 0) return;
    setPhotoState("uploading");
    setPhotoProgress({ done: 0, total: photos.length });
    try {
      const urlRes = await fetch("/api/upload-urls", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, count: photos.length }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlData.error);
      const slots = urlData.slots;
      const recorded = [];
      for (let i = 0; i < photos.length; i++) {
        const file = photos[i];
        const slot = slots[i];
        const thumb = await imageCompression(file, { maxWidthOrHeight: 2000, maxSizeMB: 1.5, useWebWorker: true, fileType: "image/jpeg" });
        const up1 = await supabaseBrowser.storage.from("photos").uploadToSignedUrl(slot.originalUpload.path, slot.originalUpload.token, file);
        if (up1.error) throw new Error(up1.error.message);
        const up2 = await supabaseBrowser.storage.from("thumbnails").uploadToSignedUrl(slot.thumbUpload.path, slot.thumbUpload.token, thumb);
        if (up2.error) throw new Error(up2.error.message);
        recorded.push({ seq: slot.seq, originalKey: slot.originalKey, thumbKey: slot.thumbKey, originalFilename: file.name, sizeBytes: file.size });
        setPhotoProgress({ done: i + 1, total: photos.length });
      }
      await fetch("/api/upload-complete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, items: recorded }),
      });
      setPhotoState("idle");
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "アップロードに失敗しました");
      setPhotoState("idle");
    }
  }

  async function uploadVideos(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const videos = Array.from(fileList).filter((f) => f.type.startsWith("video/"));
    if (videos.length === 0) return;
    setVideoState("uploading");
    try {
      for (const file of videos) {
        const urlRes = await fetch("/api/video-upload-url", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: id, filename: file.name, contentType: file.type }),
        });
        const urlData = await urlRes.json();
        if (!urlRes.ok) throw new Error(urlData.error);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", urlData.uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
          xhr.upload.onprogress = (e) => { if (e.lengthComputable) setVideoProgress(Math.round((e.loaded / e.total) * 100)); };
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`失敗 ${xhr.status}`)));
          xhr.onerror = () => reject(new Error("通信エラー"));
          xhr.send(file);
        });
        await fetch("/api/video-upload-complete", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: id, seq: urlData.seq, key: urlData.key, filename: file.name, sizeBytes: file.size }),
        });
      }
      setVideoProgress(0);
      setVideoState("idle");
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "アップロードに失敗しました");
      setVideoState("idle");
      setVideoProgress(0);
    }
  }

  if (loading) return <main style={S.page}><div style={S.wrap}><p style={S.dim}>読み込み中…</p></div></main>;
  if (!project) return <main style={S.page}><div style={S.wrap}><p style={S.dim}>案件が見つかりません</p></div></main>;

  const base = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = `${base}/d/${project.link_id}`;
  const isFinal = project.delivery_type === "final";

  return (
    <main style={S.page}>
      <div style={S.wrap}>
        <Link href="/admin" style={S.back}>← 案件一覧</Link>

        <div style={S.titleRow}>
          <span style={isFinal ? S.badgeFinal : S.badgeReview}>{isFinal ? "納品" : "確認用"}</span>
          <h1 style={S.h1}>{project.name}</h1>
        </div>
        <p style={S.dim}>
          撮影日 {project.shoot_date ?? "—"} ・ 写真 {photoCount}点 ・ 動画 {videoCount}本
          {project.expires_at && ` ・ ${new Date(project.expires_at).toLocaleDateString("ja-JP")} に自動削除`}
        </p>

        {/* 共有リンク */}
        <section style={S.card}>
          <p style={S.cardLabel}>共有リンク</p>
          <div style={S.rowFlex}>
            <input style={S.mono} readOnly value={shareUrl} />
            <button style={S.ghost} onClick={() => navigator.clipboard.writeText(shareUrl)}>コピー</button>
          </div>
          {newPassword ? (
            <div style={S.rowFlex}>
              <input style={S.mono} readOnly value={`新しいパスワード ${newPassword}`} />
              <button style={S.ghost} onClick={() => navigator.clipboard.writeText(newPassword)}>コピー</button>
            </div>
          ) : (
            <button style={S.ghost} onClick={regenerate} disabled={regenerating}>
              {regenerating ? "再発行中…" : "パスワードを再発行"}
            </button>
          )}
          <p style={S.hint}>
            パスワードは暗号化して保存しているため、後から表示できません。忘れた場合は再発行してください（古いパスワードは無効になります）。
          </p>
        </section>

        {/* ファイル追加 */}
        <section style={S.card}>
          <p style={S.cardLabel}>ファイルを追加</p>
          <div style={S.rowFlex}>
            <button style={S.addBtn} onClick={() => photoState === "idle" && photoInput.current?.click()}>
              {photoState === "uploading" ? `写真 ${photoProgress.done}/${photoProgress.total}…` : "＋ 写真を追加"}
            </button>
            <button style={S.addBtn} onClick={() => videoState === "idle" && videoInput.current?.click()}>
              {videoState === "uploading" ? `動画 ${videoProgress}%…` : "＋ 動画を追加"}
            </button>
          </div>
          <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={(e) => uploadPhotos(e.target.files)} />
          <input ref={videoInput} type="file" accept="video/*" multiple hidden onChange={(e) => uploadVideos(e.target.files)} />
        </section>

        {/* プレビュー */}
        {(pPhotos.length > 0 || pVideos.length > 0) && (
          <section style={S.card}>
            <p style={S.cardLabel}>入っているファイル</p>

            {pVideos.map((v) => (
              <div key={v.id} style={{ marginBottom: 16 }}>
                <video src={v.playUrl} controls preload="metadata" style={S.pvVideo} />
                <div style={S.pvVideoMeta}>
                  <span style={S.pvName}>{v.filename}</span>
                  <button style={S.ghost} onClick={() => saveFile(v.downloadUrl, v.filename)}>ダウンロード</button>
                </div>
              </div>
            ))}

            {pPhotos.length > 0 && (
              <div style={S.pvGrid}>
                {pPhotos.map((p, i) => (
                  <div key={p.id} style={S.pvThumb}>
                    {p.url && <img src={p.url} alt={`写真 ${p.seq}`} style={S.pvImg} loading="lazy" onClick={() => setLightbox(i)} />}
                    <span style={S.pvSeq}>{String(p.seq).padStart(3, "0")}</span>
                    {p.downloadUrl && (
                      <button style={S.pvDl} onClick={() => saveFile(p.downloadUrl!, p.filename)} aria-label="ダウンロード">↓</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ログ */}
        <section style={S.card}>
          <p style={S.cardLabel}>閲覧・ダウンロード履歴</p>
          {events.length === 0 ? (
            <p style={S.dim}>まだ履歴がありません</p>
          ) : (
            <div style={S.logList}>
              {events.map((e) => (
                <div key={e.id} style={S.logRow}>
                  <span style={S.logTime}>
                    {new Date(e.occurred_at).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span style={S.logAction}>
                    {ACTION_LABEL[e.action] ?? e.action}
                    {e.action === "download" && e.meta?.kind === "bulk" && "（一括）"}
                    {e.action === "select_submit" && Array.isArray(e.meta?.numbers) && `：${(e.meta.numbers as string[]).join(", ")}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {lightbox !== null && pPhotos[lightbox]?.url && (
        <div style={S.lb} onClick={() => setLightbox(null)}>
          <button style={{ ...S.lbBtn, top: 20, right: 24, width: 44, height: 44, fontSize: 18 }}
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>✕</button>
          <button style={{ ...S.lbBtn, left: 20, top: "50%", transform: "translateY(-50%)", width: 52, height: 52, fontSize: 30 }}
            onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i === null ? i : (i - 1 + pPhotos.length) % pPhotos.length)); }}>‹</button>
          <img src={pPhotos[lightbox].url!} alt="" style={S.lbImg} onClick={(e) => e.stopPropagation()} />
          <button style={{ ...S.lbBtn, right: 20, top: "50%", transform: "translateY(-50%)", width: 52, height: 52, fontSize: 30 }}
            onClick={(e) => { e.stopPropagation(); setLightbox((i) => (i === null ? i : (i + 1) % pPhotos.length)); }}>›</button>
          <span style={S.lbCaption}>{lightbox + 1} / {pPhotos.length}</span>
        </div>
      )}
    </main>
  );
}

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

const S: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#fafafa", padding: "32px 16px 80px" },
  wrap: { maxWidth: 720, margin: "0 auto" },
  back: { fontSize: 13, color: "#888", textDecoration: "none", display: "inline-block", marginBottom: 20 },
  titleRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6 },
  h1: { fontSize: 22, fontWeight: 500, margin: 0 },
  badgeReview: { fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 5, border: "0.5px solid #d4d4d4", color: "#666" },
  badgeFinal: { fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 5, background: "#1a1a1a", color: "#fff" },
  dim: { fontSize: 13, color: "#999", margin: "0 0 20px" },
  card: { background: "#fff", border: "0.5px solid #e5e5e5", borderRadius: 12, padding: "18px 20px", marginBottom: 14 },
  cardLabel: { fontSize: 12, letterSpacing: "0.1em", color: "#888", margin: "0 0 12px" },
  rowFlex: { display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  mono: { flex: 1, minWidth: 200, height: 38, border: "0.5px solid #e5e5e5", borderRadius: 8, padding: "0 12px", fontSize: 13, fontFamily: mono, background: "#fff", boxSizing: "border-box" },
  ghost: { height: 38, padding: "0 14px", background: "#fff", border: "0.5px solid #d4d4d4", borderRadius: 8, fontSize: 13, color: "#555", cursor: "pointer", whiteSpace: "nowrap" },
  addBtn: { height: 40, padding: "0 18px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" },
  hint: { fontSize: 12, color: "#999", margin: "8px 0 0", lineHeight: 1.6 },
  logList: { display: "flex", flexDirection: "column" },
  logRow: { display: "flex", gap: 14, padding: "8px 0", borderBottom: "0.5px solid #f0f0f0", fontSize: 13 },
  logTime: { color: "#999", fontFamily: mono, fontSize: 12, whiteSpace: "nowrap" },
  logAction: { color: "#333" },

  pvVideo: { width: "100%", borderRadius: 10, background: "#000", display: "block" },
  pvVideoMeta: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8, flexWrap: "wrap" },
  pvName: { fontSize: 13, color: "#333" },
  pvGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 },
  pvThumb: { position: "relative", aspectRatio: "3/2", background: "#f4f4f4", border: "0.5px solid #eee", borderRadius: 8, overflow: "hidden" },
  pvImg: { width: "100%", height: "100%", objectFit: "cover", cursor: "pointer", display: "block" },
  pvSeq: { position: "absolute", bottom: 4, left: 6, fontSize: 10, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.6)", pointerEvents: "none" },
  pvDl: { position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 6, background: "rgba(255,255,255,0.9)", border: "0.5px solid #ddd", fontSize: 13, color: "#333", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 },
  lb: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 24 },
  lbImg: { maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain" },
  lbBtn: { position: "fixed", background: "rgba(255,255,255,0.12)", color: "#fff", border: "none", borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  lbCaption: { position: "fixed", bottom: 24, left: 0, right: 0, textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: 13 },
};