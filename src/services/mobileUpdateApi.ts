const BASE_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_CHAT_API_URL || "https://chat.pirogov.ai")
    : "https://chat.pirogov.ai";

export interface MobileVersionCheckResponse {
  has_update: boolean;
  is_forced: boolean;
  latest_version?: string | null;
  min_supported_version?: string | null;
  download_url?: string | null;
  remind_after_hours?: number;
  title?: string;
  message?: string;
}

export async function checkMobileUpdateVersion(
  accessToken: string,
  payload: { platform: "android" | "ios"; app_version: string },
): Promise<MobileVersionCheckResponse> {
  const url = `${BASE_URL.replace(/\/$/, "")}/api/v1/mobile/version-check`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as MobileVersionCheckResponse & { detail?: string };
  if (!res.ok) {
    throw new Error(data.detail || `HTTP ${res.status}`);
  }
  return data;
}

