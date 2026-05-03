import { ensureNativeMicrophoneForMeetCall } from "@/lib/meetNativeMic";
import { ensureNativeCameraForMeetCall } from "@/lib/meetNativeCamera";
import type { MeetCallLogPayload } from "@/stores/chatStore";
import { meetCreateCall, meetFetchIceServers, type MeetCallMedia } from "@/services/meetApi";

export type { MeetCallMedia };

export type MeetPhase =
  | "idle"
  | "ws_connecting"
  | "ws_ready"
  | "outgoing_ringing"
  | "incoming"
  | "in_call"
  | "error";

export type MeetSnapshot = {
  phase: MeetPhase;
  errorMessage?: string;
  callId?: string;
  /** Сторона, с которой идёт / шёл звонок (incoming: caller; outgoing: callee). */
  remoteUserId?: string;
  remoteStream: MediaStream | null;
  /** Локальный поток (превью камеры). */
  localStream: MediaStream | null;
  /** Стартовый режим текущего вызова (для подписей UI и getUserMedia при ответе). */
  meetMedia?: MeetCallMedia;
  /** У удалённой стороны есть активное видео. */
  remoteHasVideo?: boolean;
  /** Момент перехода в in_call (мс), для таймера длительности разговора в UI. */
  callConnectedAtMs?: number;
};

function buildMeetSignalingWsUrl(baseUrl: string, accessToken: string): string {
  const u = new URL(baseUrl);
  const wsScheme = u.protocol === "https:" ? "wss:" : "ws:";
  const basePath = (u.pathname || "/").replace(/\/+$/, "");
  const path = `${basePath}/ws/signaling`;
  const q = new URLSearchParams({ token: accessToken });
  return `${wsScheme}//${u.host}${path}?${q.toString()}`;
}

type WsIncoming = Record<string, unknown> & { type?: string };

function hintForWsClose(code: number, reason: string): string {
  const r = reason?.trim();
  const extra = r ? ` (${r})` : "";
  if (code === 4401) return `Доступ запрещён (токен)${extra}`;
  if (code === 1006)
    return `Соединение оборвалось до ответа сервера${extra}. Проверьте URL MeetService, HTTPS и доступность порта с телефона.`;
  if (code === 1002) return `Ошибка протокола WebSocket${extra}`;
  return `WebSocket закрыт с кодом ${code}${extra}`;
}

function parseMeetMedia(v: unknown): MeetCallMedia {
  return v === "video" ? "video" : "audio";
}

export type MeetCallControllerOptions = {
  localUserId?: string;
  /** peerUserId — второй участник 1:1 (для sendMessage / журнала звонка). */
  onPersistCallLog?: (payload: MeetCallLogPayload, peerUserId: string) => void;
};

export class MeetCallController {
  private snap: MeetSnapshot = {
    phase: "idle",
    remoteStream: null,
    localStream: null,
    callConnectedAtMs: undefined,
    remoteHasVideo: false,
  };
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  /** Один MediaStream для всех удалённых треков (аудио + видео могут прийти отдельными ontrack). */
  private remoteRecvStream: MediaStream | null = null;
  private activeCallId: string | null = null;
  private role: "caller" | "callee" | null = null;
  private iceServers: RTCIceServer[] = [];
  private remoteIceBuffer: RTCIceCandidateInit[] = [];
  private intentionalWsClose = false;
  private _connectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connectResolve: ((ok: boolean) => void) | null = null;
  private connectFailureDetail: string | null = null;
  private _wsHandshakeDone = false;
  /** Момент перехода в in_call (для длительности в журнале чата). */
  private answeredAtMs: number | null = null;
  /** Режим исходящего звонка (до и во время ringing). */
  private outgoingCallMedia: MeetCallMedia = "audio";

  constructor(
    private readonly baseUrl: string,
    private readonly getAccessToken: () => Promise<string | null>,
    private readonly onUpdate: (s: MeetSnapshot) => void,
    private readonly options?: MeetCallControllerOptions,
  ) {}

  private get localUserId(): string {
    return (this.options?.localUserId ?? "").trim();
  }

  private persistCallLog(payload: MeetCallLogPayload): void {
    const peer = (this.snap.remoteUserId ?? "").trim();
    if (!peer) return;
    this.options?.onPersistCallLog?.(payload, peer);
  }

  getSnapshot(): MeetSnapshot {
    return { ...this.snap };
  }

  private push(next: Partial<MeetSnapshot>) {
    this.snap = { ...this.snap, ...next };
    if (this.snap.phase === "in_call" && this.snap.callConnectedAtMs == null) {
      const t = Date.now();
      this.snap = { ...this.snap, callConnectedAtMs: t };
      if (this.answeredAtMs == null) this.answeredAtMs = t;
    }
    this.onUpdate({ ...this.snap });
  }

  private _finishConnect(ok: boolean): void {
    if (this._connectTimer) {
      clearTimeout(this._connectTimer);
      this._connectTimer = null;
    }
    if (this._connectResolve) {
      const r = this._connectResolve;
      this._connectResolve = null;
      r(ok);
    }
  }

  /** Подключение к MeetService WS; `true` когда получено `connected`. */
  async connect(): Promise<boolean> {
    const keep =
      this.ws?.readyState === WebSocket.OPEN &&
      (this.snap.phase === "ws_ready" ||
        this.snap.phase === "incoming" ||
        this.snap.phase === "outgoing_ringing" ||
        this.snap.phase === "in_call");
    if (keep) {
      return true;
    }

    this.connectFailureDetail = null;
    this._wsHandshakeDone = false;

    const token = await this.getAccessToken();
    if (!token) {
      this.push({ phase: "error", errorMessage: "Нет авторизации", callConnectedAtMs: undefined });
      return false;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* */
      }
      this.ws = null;
    }

    this.intentionalWsClose = false;
    this.push({ phase: "ws_connecting", errorMessage: undefined });

    const url = buildMeetSignalingWsUrl(this.baseUrl, token);
    const ws = new WebSocket(url);
    this.ws = ws;

    const result = await new Promise<boolean>((resolve) => {
      this._connectResolve = resolve;
      this._connectTimer = setTimeout(() => {
        if (!this.connectFailureDetail?.trim()) {
          this.connectFailureDetail =
            "Нет ответа от MeetService за 15 с. Проверьте, что сервис запущен, порт открыт в firewall и в ChatService указан верный MEET_SERVICE_PUBLIC_URL (с телефона — IP ПК в Wi‑Fi, не localhost).";
        }
        this._finishConnect(false);
      }, 15000);

      ws.onmessage = (ev) => {
        void this._onWsMessage(ev.data as string);
      };
      ws.onerror = () => {
        if (!this.connectFailureDetail?.trim()) {
          const securePageInsecureWs =
            typeof window !== "undefined" && window.isSecureContext && url.startsWith("ws:");
          this.connectFailureDetail = securePageInsecureWs
            ? "WebSocket к Meet не открылся: страница в secure-контексте (https), а сигналинг ws:// — WebView может блокировать смешанный контент. Выполните npx cap sync после allowMixedContent в capacitor.config; в проде задайте Meet по HTTPS (wss://)."
            : "WebSocket к Meet не открылся. Проверьте MEET_SERVICE_PUBLIC_URL, доступность порта с телефона и сеть Wi‑Fi; при https у Meet должен открываться wss://.";
        }
        this._finishConnect(false);
      };
      ws.onclose = (event: Event) => {
        const ev = event as CloseEvent;
        const wasIntentional = this.intentionalWsClose;
        this.ws = null;
        if (!wasIntentional && !this._wsHandshakeDone && !this.connectFailureDetail?.trim()) {
          this.connectFailureDetail = hintForWsClose(ev.code, ev.reason ?? "");
        }
        this._finishConnect(false);
        if (!wasIntentional && this._wsHandshakeDone) {
          const ph = this.snap.phase;
          if (ph !== "idle" && ph !== "error" && ph !== "ws_connecting") {
            this.teardownMedia();
            this.push({
              phase: "error",
              errorMessage: "Связь с MeetService прервана",
              callConnectedAtMs: undefined,
              meetMedia: undefined,
            });
          }
        }
      };
    });

    if (!result) {
      const detail = String(this.connectFailureDetail ?? "").trim();
      const fallback =
        "Не удалось подключиться к MeetService. С телефона задайте в ChatService MEET_SERVICE_PUBLIC_URL=http://IP_вашего_ПК_в_Wi-Fi:8480 (не localhost).";
      this.push({ phase: "error", errorMessage: detail || fallback, callConnectedAtMs: undefined });
    }

    return result;
  }

  disconnect(): void {
    this.intentionalWsClose = true;
    this._finishConnect(false);
    this.teardownMedia();
    this.activeCallId = null;
    this.role = null;
    this.outgoingCallMedia = "audio";
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* */
      }
      this.ws = null;
    }
    this.push({
      phase: "idle",
      remoteStream: null,
      localStream: null,
      callId: undefined,
      remoteUserId: undefined,
      errorMessage: undefined,
      callConnectedAtMs: undefined,
      meetMedia: undefined,
      remoteHasVideo: false,
    });
  }

  /** Исходящий звонок: media — только голос или сразу с камерой. */
  async startOutgoing(peerUserId: string, roomId?: string | null, media: MeetCallMedia = "audio"): Promise<void> {
    if (this.snap.phase === "incoming" || this.snap.phase === "in_call" || this.snap.phase === "outgoing_ringing") {
      return;
    }
    const token = await this.getAccessToken();
    if (!token) {
      this.push({ phase: "error", errorMessage: "Нет авторизации", callConnectedAtMs: undefined });
      return;
    }
    const connected = await this.connect();
    if (!connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.iceServers = await meetFetchIceServers(token, this.baseUrl);
    } catch (e) {
      console.warn("meetFetchIceServers", e);
      this.iceServers = [];
    }

    this.outgoingCallMedia = media;
    const created = await meetCreateCall(token, peerUserId, this.baseUrl, roomId ?? null, media);
    this.activeCallId = created.id;
    this.role = "caller";
    const m = created.media === "video" ? "video" : "audio";
    this.push({
      phase: "outgoing_ringing",
      callId: created.id,
      remoteUserId: peerUserId,
      errorMessage: undefined,
      callConnectedAtMs: undefined,
      meetMedia: m,
    });
  }

  async acceptIncoming(callId: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.activeCallId = callId;
    this.role = "callee";
    const wantVideo = this.snap.meetMedia === "video";
    try {
      await this._ensureLocalMediaAndPc(wantVideo);
    } catch (e) {
      this.teardownMedia();
      this.activeCallId = null;
      this.role = null;
      this.push({
        phase: "error",
        errorMessage: e instanceof Error ? e.message : "Нет доступа к микрофону",
        callConnectedAtMs: undefined,
        meetMedia: undefined,
        localStream: null,
        remoteStream: null,
        remoteHasVideo: false,
      });
      return;
    }
    this.ws.send(JSON.stringify({ type: "call.accept", call_id: callId }));
    const t = Date.now();
    this.answeredAtMs = t;
    this.push({ phase: "in_call", callId, errorMessage: undefined, callConnectedAtMs: t });
  }

  rejectIncoming(callId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const callerId = (this.snap.remoteUserId ?? "").trim();
    this.ws.send(JSON.stringify({ type: "call.reject", call_id: callId }));
    if (this.snap.phase === "incoming" && this.snap.callId === callId) {
      if (callerId) {
        this.persistCallLog({ initiated_by: callerId, outcome: "declined" });
      }
      this.activeCallId = null;
      this.role = null;
      this.push({
        phase: "ws_ready",
        callId: undefined,
        remoteUserId: undefined,
        callConnectedAtMs: undefined,
        meetMedia: undefined,
      });
    }
  }

  hangup(): void {
    const id = this.activeCallId;
    const peerId = (this.snap.remoteUserId ?? "").trim();
    const wasInCall = this.snap.phase === "in_call";
    const wasOutgoingRinging = this.snap.phase === "outgoing_ringing";
    const role = this.role;
    const answeredMs = this.answeredAtMs;

    if (id && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "call.end", call_id: id }));
      } catch {
        /* */
      }
    }

    if (peerId && this.localUserId) {
      if (role === "caller" && wasOutgoingRinging) {
        this.persistCallLog({ initiated_by: this.localUserId, outcome: "missed" });
      } else if (role === "caller" && wasInCall && answeredMs != null) {
        const duration_sec = Math.max(0, Math.round((Date.now() - answeredMs) / 1000));
        this.persistCallLog({ initiated_by: this.localUserId, outcome: "completed", duration_sec });
      }
    }

    this.teardownMedia();
    this.activeCallId = null;
    this.role = null;
    this.outgoingCallMedia = "audio";
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.push({
        phase: "ws_ready",
        remoteStream: null,
        localStream: null,
        callId: undefined,
        remoteUserId: undefined,
        callConnectedAtMs: undefined,
        meetMedia: undefined,
        remoteHasVideo: false,
      });
    } else {
      this.push({
        phase: "idle",
        remoteStream: null,
        localStream: null,
        callId: undefined,
        remoteUserId: undefined,
        callConnectedAtMs: undefined,
        meetMedia: undefined,
        remoteHasVideo: false,
      });
    }
  }

  /**
   * Включить или выключить локальную камеру в разговоре.
   * При первом включении после аудио — renegotiation (новый offer/answer).
   */
  async setLocalCameraEnabled(enabled: boolean): Promise<void> {
    if (this.snap.phase !== "in_call" || !this.pc || !this.localStream) return;
    const vt = this.localStream.getVideoTracks()[0];
    if (vt) {
      vt.enabled = enabled;
      this.push({ localStream: this.localStream });
      return;
    }
    if (!enabled) return;
    try {
      await ensureNativeCameraForMeetCall();
      const vs = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });
      const track = vs.getVideoTracks()[0];
      if (!track) return;
      this.localStream.addTrack(track);
      this.pc.addTrack(track, this.localStream);
      this.push({ localStream: this.localStream });
      if (this.role === "caller") await this._callerRenegotiateOffer();
      else await this._calleeRenegotiateOffer();
    } catch (e) {
      console.warn("setLocalCameraEnabled", e);
    }
  }

  private teardownMedia(): void {
    this.answeredAtMs = null;
    this.remoteIceBuffer = [];
    this.remoteRecvStream = null;
    if (this.pc) {
      try {
        this.pc.close();
      } catch {
        /* */
      }
      this.pc = null;
    }
    if (this.localStream) {
      for (const t of this.localStream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* */
        }
      }
      this.localStream = null;
    }
    this.push({ remoteStream: null, localStream: null, remoteHasVideo: false });
  }

  private async _ensureLocalMediaAndPc(wantVideo: boolean): Promise<void> {
    if (!this.iceServers.length) {
      const token = await this.getAccessToken();
      if (token) {
        try {
          this.iceServers = await meetFetchIceServers(token, this.baseUrl);
        } catch {
          this.iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
        }
      } else {
        this.iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
      }
    }
    if (!this.localStream) {
      await ensureNativeMicrophoneForMeetCall();
      if (wantVideo) {
        await ensureNativeCameraForMeetCall();
      }
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: wantVideo ? { facingMode: "user" } : false,
      });
      this.push({ localStream: this.localStream });
    } else if (wantVideo && !this.localStream.getVideoTracks().length) {
      await ensureNativeCameraForMeetCall();
      const vs = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user" },
      });
      const track = vs.getVideoTracks()[0];
      if (track) {
        this.localStream.addTrack(track);
        this.push({ localStream: this.localStream });
      }
    }
    if (!this.pc) {
      const pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.pc = pc;
      for (const t of this.localStream.getTracks()) {
        pc.addTrack(t, this.localStream);
      }
      pc.ontrack = (ev) => {
        if (!this.remoteRecvStream) this.remoteRecvStream = new MediaStream();
        const nt = ev.track;
        if (!this.remoteRecvStream.getTracks().some((t) => t.id === nt.id)) {
          this.remoteRecvStream.addTrack(nt);
        }
        const bumpRemoteVideo = () => {
          if (!this.remoteRecvStream) return;
          const hasVideo = this.remoteRecvStream
            .getVideoTracks()
            .some((t) => t.readyState === "live" && t.enabled && !t.muted);
          this.push({ remoteStream: this.remoteRecvStream, remoteHasVideo: hasVideo });
        };
        bumpRemoteVideo();
        nt.addEventListener("ended", bumpRemoteVideo);
        nt.addEventListener("mute", bumpRemoteVideo);
        nt.addEventListener("unmute", bumpRemoteVideo);
      };
      pc.onicecandidate = (ev) => {
        if (!ev.candidate || !this.activeCallId || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(
          JSON.stringify({
            type: "webrtc.ice_candidate",
            call_id: this.activeCallId,
            candidate: ev.candidate.toJSON(),
          }),
        );
      };
    }
  }

  private async _onWsMessage(raw: string): Promise<void> {
    let data: WsIncoming;
    try {
      data = JSON.parse(raw) as WsIncoming;
    } catch {
      return;
    }
    const type = data.type;
    if (type === "connected" || type === "signal.ice_servers") {
      if (type === "signal.ice_servers" && Array.isArray(data.ice_servers)) {
        this.iceServers = data.ice_servers as RTCIceServer[];
      }
      if (type === "connected" && this.snap.phase === "ws_connecting") {
        this._wsHandshakeDone = true;
        this.push({ phase: "ws_ready", errorMessage: undefined, callConnectedAtMs: undefined });
        this._finishConnect(true);
      }
      return;
    }

    if (type === "call.incoming") {
      const callId = String(data.call_id ?? "");
      const callerId = String(data.caller_id ?? "");
      if (!callId || this.snap.phase === "in_call" || this.snap.phase === "outgoing_ringing") return;
      this.activeCallId = callId;
      const mm = parseMeetMedia(data.media);
      this.push({
        phase: "incoming",
        callId,
        remoteUserId: callerId,
        errorMessage: undefined,
        callConnectedAtMs: undefined,
        meetMedia: mm,
      });
      return;
    }

    if (type === "call.accepted") {
      const callId = String(data.call_id ?? "");
      if (!callId || this.role !== "caller" || callId !== this.activeCallId) return;
      await this._callerCreateOffer(callId);
      return;
    }

    if (type === "webrtc.offer") {
      const callId = String(data.call_id ?? "");
      const sdp = String(data.sdp ?? "");
      if (!callId || !sdp || callId !== this.activeCallId) return;
      if (this.role === "callee") await this._calleeHandleOffer(sdp);
      else await this._callerHandleRenegotiationOffer(sdp);
      return;
    }

    if (type === "webrtc.answer") {
      const callId = String(data.call_id ?? "");
      const sdp = String(data.sdp ?? "");
      if (!callId || !sdp || callId !== this.activeCallId) return;
      if (this.role === "caller") await this._callerHandleAnswer(sdp);
      else await this._calleeHandleAnswer(sdp);
      return;
    }

    if (type === "webrtc.ice_candidate") {
      const callId = String(data.call_id ?? "");
      const cand = data.candidate as RTCIceCandidateInit | undefined;
      if (!callId || !cand || callId !== this.activeCallId) return;
      await this._addRemoteIce(cand);
      return;
    }

    if (type === "call.ended" || type === "call.rejected" || type === "call.cancelled") {
      const callId = String(data.call_id ?? "");
      if (callId && this.activeCallId === callId) {
        const wasInCall = this.snap.phase === "in_call";
        const answeredMs = this.answeredAtMs;
        if (
          type === "call.ended" &&
          wasInCall &&
          this.role === "caller" &&
          answeredMs != null &&
          this.localUserId
        ) {
          const duration_sec = Math.max(0, Math.round((Date.now() - answeredMs) / 1000));
          this.persistCallLog({ initiated_by: this.localUserId, outcome: "completed", duration_sec });
        }
        this.teardownMedia();
        this.activeCallId = null;
        this.role = null;
        this.outgoingCallMedia = "audio";
        this.push({
          phase: this.ws && this.ws.readyState === WebSocket.OPEN ? "ws_ready" : "idle",
          remoteStream: null,
          localStream: null,
          callId: undefined,
          remoteUserId: undefined,
          callConnectedAtMs: undefined,
          meetMedia: undefined,
          remoteHasVideo: false,
        });
      }
      return;
    }
  }

  private async _callerCreateOffer(callId: string): Promise<void> {
    const wantVideo = this.outgoingCallMedia === "video";
    await this._ensureLocalMediaAndPc(wantVideo);
    const pc = this.pc;
    if (!pc) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "webrtc.offer", call_id: callId, sdp: offer.sdp ?? "" }));
    }
    const t = Date.now();
    this.answeredAtMs = t;
    this.push({ phase: "in_call", callId, errorMessage: undefined, callConnectedAtMs: t });
  }

  private async _callerRenegotiateOffer(): Promise<void> {
    const pc = this.pc;
    const callId = this.activeCallId;
    if (!pc || !callId || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.ws.send(JSON.stringify({ type: "webrtc.offer", call_id: callId, sdp: offer.sdp ?? "" }));
  }

  private async _calleeRenegotiateOffer(): Promise<void> {
    const pc = this.pc;
    const callId = this.activeCallId;
    if (!pc || !callId || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.ws.send(JSON.stringify({ type: "webrtc.offer", call_id: callId, sdp: offer.sdp ?? "" }));
  }

  private async _calleeHandleOffer(sdp: string): Promise<void> {
    const wantVideo = this.snap.meetMedia === "video";
    await this._ensureLocalMediaAndPc(wantVideo);
    const pc = this.pc;
    if (!pc) return;
    await pc.setRemoteDescription({ type: "offer", sdp });
    await this._flushRemoteIceBuffer();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.activeCallId) {
      this.ws.send(
        JSON.stringify({ type: "webrtc.answer", call_id: this.activeCallId, sdp: answer.sdp ?? "" }),
      );
    }
  }

  private async _callerHandleAnswer(sdp: string): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    await pc.setRemoteDescription({ type: "answer", sdp });
    await this._flushRemoteIceBuffer();
  }

  private async _calleeHandleAnswer(sdp: string): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    await pc.setRemoteDescription({ type: "answer", sdp });
    await this._flushRemoteIceBuffer();
  }

  private async _callerHandleRenegotiationOffer(sdp: string): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    await pc.setRemoteDescription({ type: "offer", sdp });
    await this._flushRemoteIceBuffer();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.activeCallId) {
      this.ws.send(
        JSON.stringify({ type: "webrtc.answer", call_id: this.activeCallId, sdp: answer.sdp ?? "" }),
      );
    }
  }

  private async _addRemoteIce(init: RTCIceCandidateInit): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    if (!pc.remoteDescription) {
      this.remoteIceBuffer.push(init);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(init));
    } catch (e) {
      console.warn("addIceCandidate", e);
    }
  }

  private async _flushRemoteIceBuffer(): Promise<void> {
    const buf = [...this.remoteIceBuffer];
    this.remoteIceBuffer = [];
    for (const c of buf) {
      await this._addRemoteIce(c);
    }
  }
}
