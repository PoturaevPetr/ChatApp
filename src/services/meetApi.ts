function apiRoot(meetBase: string): string {
  return `${meetBase.replace(/\/$/, "")}/api/v1`;
}

export type MeetCallMedia = "audio" | "video";

export type MeetCreateCallResponse = {
  id: string;
  caller_id: string;
  callee_id: string;
  status: string;
  room_id: string | null;
  media: MeetCallMedia;
};

export async function meetFetchIceServers(accessToken: string, meetBase: string): Promise<RTCIceServer[]> {
  const res = await fetch(`${apiRoot(meetBase)}/config/ice-servers`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `ICE config ${res.status}`);
  }
  const data = (await res.json()) as { ice_servers: RTCIceServer[] };
  return Array.isArray(data.ice_servers) ? data.ice_servers : [];
}

export async function meetCreateCall(
  accessToken: string,
  peerUserId: string,
  meetBase: string,
  roomId?: string | null,
  media: MeetCallMedia = "audio",
): Promise<MeetCreateCallResponse> {
  const body: { peer_user_id: string; room_id?: string | null; media: MeetCallMedia } = {
    peer_user_id: peerUserId,
    media,
  };
  if (roomId) body.room_id = roomId;

  const res = await fetch(`${apiRoot(meetBase)}/calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `Создание звонка ${res.status}`);
  }
  const j = (await res.json()) as Partial<MeetCreateCallResponse> & { id: string };
  return {
    ...j,
    media: j.media === "video" ? "video" : "audio",
  } as MeetCreateCallResponse;
}
