/**
 * API пользователей ChatService
 * POST /api/v1/users/search — поиск
 * GET /api/v1/user/{user_id} — данные пользователя
 */

const BASE_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CHAT_API_URL || "https://chat.pirogov.ai")
    : "https://chat.pirogov.ai";

const SERVICE_ID = "chatApp";

/** Элемент из ответа POST /api/v1/users/search */
export interface UserSearchItem {
  id: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  birth_date?: string;
  avatar?: string | null;
  /** Полное имя для отображения (собрано из first_name, last_name, middle_name) */
  name?: string;
  /** ISO 8601, поле API last_seen_at */
  lastSeenAt?: string | null;
}

export async function searchUsers(
  accessToken: string,
  query: string
): Promise<UserSearchItem[]> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/users/search`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      query: query.trim(),
    }),
  });

  if (!res.ok) {
    if (res.status === 404) return [];
    const data = await res.json().catch(() => ({}));
    const detail = typeof (data as { detail?: string }).detail === "string" ? (data as { detail: string }).detail : res.statusText;
    throw new Error(detail || `HTTP ${res.status}`);
  }

  const data = await res.json();
  const rawList = Array.isArray(data)
    ? data
    : Array.isArray((data as { users?: unknown }).users)
      ? (data as { users: unknown[] }).users
      : Array.isArray((data as { results?: unknown }).results)
        ? (data as { results: unknown[] }).results
        : Array.isArray((data as { data?: unknown }).data)
          ? (data as { data: unknown[] }).data
          : [];
  return rawList
    .map((u: {
      id?: string;
      user_id?: string;
      first_name?: string;
      last_name?: string;
      middle_name?: string;
      birth_date?: string;
      avatar?: string | null;
      last_seen_at?: string | null;
    }) => parseUserFromApi(u))
    .filter((u) => u.id);
}

function parseUserFromApi(u: {
  id?: string;
  user_id?: string;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  birth_date?: string;
  avatar?: string | null;
  last_seen_at?: string | null;
}): UserSearchItem {
  const id = String(u.id ?? u.user_id ?? "");
  const parts = [u.last_name, u.first_name, u.middle_name].filter(Boolean) as string[];
  const name = parts.length > 0 ? parts.join(" ").trim() : undefined;
  const rawSeen = u.last_seen_at;
  return {
    id,
    first_name: u.first_name,
    last_name: u.last_name,
    middle_name: u.middle_name,
    birth_date: u.birth_date,
    avatar: u.avatar ?? null,
    name,
    lastSeenAt: rawSeen != null && String(rawSeen).trim() !== "" ? String(rawSeen) : null,
  };
}

/**
 * Запрос данных пользователя по id.
 * GET /api/v1/user/{user_id}
 */
export async function getUserById(
  accessToken: string,
  userId: string
): Promise<UserSearchItem | null> {
  const id = userId.trim();
  if (!id) return null;
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/users/${encodeURIComponent(id)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    const data = await res.json().catch(() => ({}));
    const detail =
      typeof (data as { detail?: string }).detail === "string"
        ? (data as { detail: string }).detail
        : res.statusText;
    throw new Error(detail || `HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    id?: string;
    user_id?: string;
    first_name?: string;
    last_name?: string;
    middle_name?: string;
    birth_date?: string;
    avatar?: string | null;
    last_seen_at?: string | null;
  };
  return parseUserFromApi(data);
}
