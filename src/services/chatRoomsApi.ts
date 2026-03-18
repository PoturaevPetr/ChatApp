/**
 * API комнат ChatService
 * GET /api/v1/rooms/ — список комнат пользователя
 * POST /api/v1/rooms/ — создание чата (room) с пользователем
 */

const BASE_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CHAT_API_URL || "https://chat.pirogov.ai")
    : "https://chat.pirogov.ai";

export interface RoomUser {
  id: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  birth_date?: string;
  avatar?: string | null;
}

/** Последнее сообщение комнаты (превью в списке чатов). */
export interface RoomLastMessage {
  message_id: string;
  sender_id: string;
  recipient_id: string | null;
  room_id: string | null;
  encrypted_data: string;
  encrypted_aes_key: string;
  nonce: string;
  sent_at: string;
  is_read: boolean;
}

export interface Room {
  id: string;
  name: string;
  description: string;
  created_at: string;
  created_by: string;
  users: RoomUser[];
  last_message?: RoomLastMessage | null;
}

export interface CreateRoomResponse {
  room_id: string;
  user_id?: string;
}

/**
 * Список комнат (чатов) текущего пользователя.
 * GET /api/v1/rooms/
 */
export async function getRooms(accessToken: string): Promise<Room[]> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/rooms/`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail =
      typeof (data as { detail?: string }).detail === "string"
        ? (data as { detail: string }).detail
        : res.statusText;
    throw new Error(detail || `HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.map((r: Room & { last_message?: RoomLastMessage | null }) => ({
    id: String(r.id ?? ""),
    name: r.name ?? "",
    description: r.description ?? "",
    created_at: r.created_at ?? "",
    created_by: r.created_by ?? "",
    users: Array.isArray(r.users) ? r.users.map((u: RoomUser) => ({
      id: String(u.id),
      first_name: u.first_name,
      last_name: u.last_name,
      middle_name: u.middle_name,
      birth_date: u.birth_date,
      avatar: u.avatar ?? null,
    })) : [],
    last_message: r.last_message ?? null,
  }));
}

/**
 * Создаёт новую комнату (чат) с указанным пользователем.
 * После успешного ответа можно переходить на страницу чата.
 */
export async function createRoom(
  accessToken: string,
  userId: string
): Promise<CreateRoomResponse> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/rooms/`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId.trim() }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail =
      typeof (data as { detail?: string }).detail === "string"
        ? (data as { detail: string }).detail
        : res.statusText;
    throw new Error(detail || `HTTP ${res.status}`);
  }

  const data = (await res.json()) as CreateRoomResponse & { room_id?: string };
  return {
    room_id: data.room_id ?? (data as unknown as { id?: string }).id ?? "",
    user_id: data.user_id ?? userId,
  };
}

/**
 * Удалить чат "для меня".
 * DELETE /api/v1/rooms/{room_id}
 */
export async function deleteRoom(accessToken: string, roomId: string): Promise<void> {
  const id = roomId.trim();
  if (!id) return;
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/rooms/${encodeURIComponent(id)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail =
      typeof (data as { detail?: string }).detail === "string"
        ? (data as { detail: string }).detail
        : res.statusText;
    throw new Error(detail || `HTTP ${res.status}`);
  }
}
