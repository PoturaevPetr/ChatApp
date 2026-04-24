"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Image as ImageIcon, Loader2, Mic, Video } from "lucide-react";
import { fetchAttachmentBlob } from "@/services/chatAttachmentsApi";
import { getValidAuthTokens } from "@/lib/validAuthToken";
import { getChatKeys } from "@/lib/secureStorage";
import { decryptAttachmentBytes } from "@/lib/fileCrypto";
import { useAuthStore } from "@/stores/authStore";
import type { ChatMessageFile } from "@/stores/chatStore";
import {
  loadPeerChatMediaItems,
  loadRoomChatMediaItems,
  type PeerMediaItem,
  type PeerMediaKind,
} from "@/lib/peerChatMedia";
import { groupMessagesByDate, formatMessageClock } from "@/utils/chatUtils";
import { downloadBlobAsFile } from "@/lib/downloadBlob";
import {
  AudioPlayer,
  ChatCircleVideo,
  ChatCircleVideoPlaceholder,
  chatVideoCircleWrapperClassName,
} from "@/components/chat/ChatMessageBody";

async function blobToDecryptedUrl(
  blob: Blob,
  mimeType: string,
  key_b64: string | undefined,
  nonce_b64: string | undefined,
): Promise<string> {
  const ab = await blob.arrayBuffer();
  if (key_b64 && nonce_b64) {
    const plain = await decryptAttachmentBytes(ab, key_b64, nonce_b64);
    return URL.createObjectURL(new Blob([plain], { type: mimeType }));
  }
  return URL.createObjectURL(blob);
}

async function resolveFileRefPreviewUrl(accessToken: string, file: ChatMessageFile): Promise<string | null> {
  const ref = file.file_ref;
  if (!ref?.attachment_id || !ref.full_key_b64 || !ref.full_nonce_b64) return null;
  const previewId = ref.thumb_attachment_id || ref.attachment_id;
  const useThumb = Boolean(ref.thumb_attachment_id) && previewId === ref.thumb_attachment_id;
  const key = useThumb ? ref.thumb_key_b64 : ref.full_key_b64;
  const nonce = useThumb ? ref.thumb_nonce_b64 : ref.full_nonce_b64;
  if (!key || !nonce) return null;
  const blob = await fetchAttachmentBlob(accessToken, previewId);
  return blobToDecryptedUrl(blob, file.mimeType, key, nonce);
}

async function resolveFileRefFullUrl(accessToken: string, file: ChatMessageFile): Promise<string | null> {
  const ref = file.file_ref;
  if (!ref?.attachment_id || !ref.full_key_b64 || !ref.full_nonce_b64) return null;
  const blob = await fetchAttachmentBlob(accessToken, ref.attachment_id);
  return blobToDecryptedUrl(blob, file.mimeType, ref.full_key_b64, ref.full_nonce_b64);
}

function revokeIfBlob(url: string | null | undefined) {
  if (url && url.startsWith("blob:")) URL.revokeObjectURL(url);
}

type PeerMediaWithTimestamp = PeerMediaItem & { timestamp: string };

function groupItemsBySendDate(items: PeerMediaItem[]): { date: string; messages: PeerMediaWithTimestamp[] }[] {
  const sorted = [...items].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
  const withTs: PeerMediaWithTimestamp[] = sorted.map((it) => ({ ...it, timestamp: it.sentAt }));
  return groupMessagesByDate(withTs);
}

const TABS: { id: PeerMediaKind; label: string; icon: typeof ImageIcon }[] = [
  { id: "image", label: "Фото", icon: ImageIcon },
  { id: "video", label: "Видео", icon: Video },
  { id: "audio", label: "Аудио", icon: Mic },
  { id: "file", label: "Файлы", icon: FileText },
];

function MediaImageCell({ item }: { item: PeerMediaItem }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [viewer, setViewer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    void (async () => {
      try {
        const tokens = await getValidAuthTokens();
        if (!tokens?.access_token || cancelled) return;
        if (item.file.data) {
          if (!cancelled) setUrl(`data:${item.file.mimeType};base64,${item.file.data}`);
          return;
        }
        const u = await resolveFileRefPreviewUrl(tokens.access_token, item.file);
        if (cancelled) {
          revokeIfBlob(u);
          return;
        }
        made = u;
        setUrl(u);
      } catch {
        if (!cancelled) setErr(true);
      }
    })();
    return () => {
      cancelled = true;
      revokeIfBlob(made);
    };
  }, [item]);

  return (
    <>
      <button
        type="button"
        onClick={() => url && setViewer(true)}
        className="relative aspect-square w-full overflow-hidden rounded-xl border border-border/50 bg-muted/30"
        aria-label={item.name}
      >
        {err ? (
          <span className="flex h-full items-center justify-center p-1 text-center text-[10px] text-muted-foreground">
            Не удалось загрузить
          </span>
        ) : url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
          </span>
        )}
      </button>
      {viewer && url ? (
        <button
          type="button"
          className="fixed inset-0 z-[200] flex cursor-default items-center justify-center border-0 bg-black/90 p-4"
          aria-label="Закрыть"
          onClick={() => setViewer(false)}
        >
          <img
            src={url}
            alt={item.name}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </button>
      ) : null}
    </>
  );
}

/** Видеосообщение как круглый кружок в чате. */
function ProfileCircleVideo({ item }: { item: PeerMediaItem }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    void (async () => {
      try {
        const tokens = await getValidAuthTokens();
        if (!tokens?.access_token || cancelled) return;
        if (item.file.data) {
          if (!cancelled) setSrc(`data:${item.file.mimeType};base64,${item.file.data}`);
          return;
        }
        let u = await resolveFileRefPreviewUrl(tokens.access_token, item.file);
        if (!u) {
          u = await resolveFileRefFullUrl(tokens.access_token, item.file);
        }
        if (cancelled) {
          revokeIfBlob(u);
          return;
        }
        made = u;
        setSrc(u);
      } catch {
        if (!cancelled) setErr(true);
      }
    })();
    return () => {
      cancelled = true;
      revokeIfBlob(made);
    };
  }, [item]);

  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-1">
      {err ? (
        <div
          className={`${chatVideoCircleWrapperClassName(item.isOwn, "grid")} flex items-center justify-center border-destructive/40 bg-muted/50 p-2 text-center text-[11px] text-muted-foreground`}
        >
          Не удалось загрузить
        </div>
      ) : src ? (
        <ChatCircleVideo src={src} isOwn={item.isOwn} fileName={item.name} layout="grid" />
      ) : (
        <ChatCircleVideoPlaceholder isOwn={item.isOwn} layout="grid" />
      )}
      <span className="text-center text-[10px] font-medium tabular-nums text-muted-foreground">
        {formatMessageClock(item.sentAt)}
      </span>
    </div>
  );
}

/** Голосовое как в чате (AudioPlayer). */
function ProfileAudioRow({ item }: { item: PeerMediaItem }) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let made: string | null = null;
    void (async () => {
      try {
        const tokens = await getValidAuthTokens();
        if (!tokens?.access_token || cancelled) return;
        if (item.file.data) {
          if (!cancelled) setSrc(`data:${item.file.mimeType};base64,${item.file.data}`);
          return;
        }
        const u = await resolveFileRefFullUrl(tokens.access_token, item.file);
        if (cancelled) {
          revokeIfBlob(u);
          return;
        }
        made = u;
        setSrc(u);
      } catch {
        if (!cancelled) setErr(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      revokeIfBlob(made);
    };
  }, [item]);

  const tintRow = item.isOwn
    ? "border-primary/35 bg-primary/8 dark:bg-primary/12"
    : "border-border/80 bg-muted/40 dark:bg-muted/30";

  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      {loading ? (
        <div
          className={`flex w-full items-center gap-2 rounded-xl border px-3 py-3 ${tintRow}`}
        >
          <Loader2
            className={`h-5 w-5 shrink-0 animate-spin ${item.isOwn ? "text-primary" : "text-muted-foreground"}`}
            aria-hidden
          />
          <span className="text-xs text-muted-foreground">Загрузка…</span>
        </div>
      ) : err ? (
        <p className="text-xs text-destructive">Не удалось загрузить аудио</p>
      ) : src ? (
        <AudioPlayer
          src={src}
          fileName={item.name}
          isOwn={item.isOwn}
          attachmentId={item.file.file_ref?.attachment_id}
          variant="profile"
        />
      ) : null}
      <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{formatMessageClock(item.sentAt)}</span>
    </div>
  );
}

function MediaFileRow({ item }: { item: PeerMediaItem }) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const tokens = await getValidAuthTokens();
      if (!tokens?.access_token) return;
      let url: string | null = null;
      if (item.file.data) {
        url = `data:${item.file.mimeType};base64,${item.file.data}`;
      } else {
        url = await resolveFileRefFullUrl(tokens.access_token, item.file);
      }
      if (!url) return;
      const blob = await fetch(url).then((r) => r.blob());
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      downloadBlobAsFile(blob, item.name || "file");
    } catch {
      //
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`flex min-w-0 max-w-full flex-col gap-1 sm:max-w-md ${item.isOwn ? "items-end self-end" : "items-start self-start"}`}
    >
      <div className="flex w-full items-center gap-3 rounded-xl border border-border/50 bg-card/40 px-3 py-2.5">
        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{item.name}</p>
          <p className="text-[11px] text-muted-foreground">{item.mimeType}</p>
        </div>
        <button
          type="button"
          onClick={() => void download()}
          disabled={busy}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {busy ? "…" : "Скачать"}
        </button>
      </div>
      <span className="text-[10px] font-medium tabular-nums text-muted-foreground">{formatMessageClock(item.sentAt)}</span>
    </div>
  );
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-2">
      <span className="rounded-full bg-muted/80 px-3 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border/60">
        {label}
      </span>
    </div>
  );
}

export function PeerChatMediaGallery({
  peerUserId,
  roomId,
}: {
  /** Личный чат: вложения по собеседнику. */
  peerUserId?: string;
  /** Группа: вложения по `room_id`. Задаётся вместо `peerUserId`. */
  roomId?: string | null;
}) {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<PeerMediaKind>("image");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noRoom, setNoRoom] = useState(false);
  const [items, setItems] = useState<PeerMediaItem[]>([]);

  const groupRoomId = roomId?.trim() ?? "";
  const peerId = peerUserId?.trim() ?? "";

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    if (!groupRoomId && !peerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const tokens = await getValidAuthTokens();
      const keys = await getChatKeys();
      if (!tokens?.access_token) {
        if (!cancelled) {
          setError("Нет доступа");
          setLoading(false);
        }
        return;
      }
      if (!keys?.private_key) {
        if (!cancelled) {
          setError("Нет ключа расшифровки на устройстве.");
          setLoading(false);
        }
        return;
      }
      try {
        if (groupRoomId) {
          const { roomId: resolved, items: list } = await loadRoomChatMediaItems(
            tokens.access_token,
            user.id,
            groupRoomId,
            keys.private_key,
          );
          if (cancelled) return;
          setNoRoom(!resolved);
          setItems(list);
        } else {
          const { roomId: resolved, items: list } = await loadPeerChatMediaItems(
            tokens.access_token,
            user.id,
            peerId,
            keys.private_key,
          );
          if (cancelled) return;
          setNoRoom(!resolved);
          setItems(list);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Не удалось загрузить вложения");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, peerId, groupRoomId]);

  const byKind = useMemo(() => {
    const m: Record<PeerMediaKind, PeerMediaItem[]> = { image: [], video: [], audio: [], file: [] };
    for (const it of items) {
      m[it.kind].push(it);
    }
    return m;
  }, [items]);

  const filtered = byKind[activeTab];
  const grouped = useMemo(() => groupItemsBySendDate(filtered), [filtered]);

  if (loading) {
    return (
      <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Загрузка вложений из чата…
      </div>
    );
  }

  if (error) {
    return <p className="mt-6 text-sm text-destructive">{error}</p>;
  }

  if (noRoom) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        {groupRoomId
          ? "Комната не найдена или у вас нет к ней доступа — медиа недоступны."
          : "Общего чата с этим пользователем пока нет — медиа из переписки появятся здесь после начала диалога."}
      </p>
    );
  }

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-foreground">Медиа из чата</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {groupRoomId
          ? "По датам отправки; время у каждого вложения. Видео — по три в ряд; аудио на всю ширину (фиолетовый — ваши сообщения, серый — других участников)."
          : "По датам отправки; время у каждого вложения. Видео — по три в ряд; аудио на всю ширину (фиолетовый оттенок — ваши, серый — собеседника)."}
      </p>

      <div className="mt-3 flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map(({ id, label, icon: Icon }) => {
          const count = byKind[id].length;
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
              <span className="tabular-nums opacity-80">({count})</span>
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">В этом чате пока нет вложений.</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">В этой категории пока ничего нет.</p>
      ) : activeTab === "image" ? (
        <div className="mt-4 space-y-4">
          {grouped.map((group) => (
            <section key={group.date} className="space-y-2">
              <DateDivider label={group.date} />
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {group.messages.map((item) => (
                  <div key={item.id} className="flex flex-col gap-1">
                    <MediaImageCell item={item} />
                    <span className="text-center text-[10px] font-medium tabular-nums text-muted-foreground">
                      {formatMessageClock(item.sentAt)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : activeTab === "video" ? (
        <div className="mt-4 space-y-4">
          {grouped.map((group) => (
            <section key={group.date} className="space-y-3">
              <DateDivider label={group.date} />
              <div className="grid grid-cols-3 gap-x-2 gap-y-4">
                {group.messages.map((item) => (
                  <div key={item.id} className="min-w-0">
                    <ProfileCircleVideo item={item} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : activeTab === "audio" ? (
        <div className="mt-4 space-y-4">
          {grouped.map((group) => (
            <section key={group.date} className="space-y-3">
              <DateDivider label={group.date} />
              <div className="flex w-full flex-col gap-3">
                {group.messages.map((item) => (
                  <div key={item.id} className="w-full min-w-0">
                    <ProfileAudioRow item={item} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {grouped.map((group) => (
            <section key={group.date} className="space-y-3">
              <DateDivider label={group.date} />
              <div className="flex flex-col gap-3">
                {group.messages.map((item) => (
                  <div key={item.id} className={`flex w-full ${item.isOwn ? "justify-end" : "justify-start"}`}>
                    <MediaFileRow item={item} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
