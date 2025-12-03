type OAuthTokensResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export type StoredGoogleTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
  scope?: string;
  tokenType?: string;
};

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() ?? null;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? null;
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI?.trim() ??
  process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI?.trim() ??
  null;

export const isGoogleCalendarConfigured = () =>
  Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI);

export const buildGoogleCalendarAuthUrl = (state: string) => {
  if (!isGoogleCalendarConfigured()) {
    throw new Error("Google Calendar is not configured");
  }

  const search = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID!,
    redirect_uri: GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });

  return `${GOOGLE_AUTH_BASE}?${search.toString()}`;
};

export const exchangeCodeForTokens = async (code: string): Promise<StoredGoogleTokens> => {
  if (!isGoogleCalendarConfigured()) {
    throw new Error("Google Calendar is not configured");
  }

  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_CLIENT_ID!,
    client_secret: GOOGLE_CLIENT_SECRET!,
    redirect_uri: GOOGLE_REDIRECT_URI!,
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Failed to exchange code for tokens (${response.status}): ${error.error || "unknown error"}`
    );
  }

  const payload: OAuthTokensResponse = await response.json();
  return normalizeTokenPayload(payload);
};

const normalizeTokenPayload = (
  payload: OAuthTokensResponse,
  fallbackRefresh?: string
): StoredGoogleTokens => {
  const expiresInSeconds = payload.expires_in ?? null;
  const expiresAt = expiresInSeconds ? Date.now() + expiresInSeconds * 1000 : null;

  return {
    accessToken: payload.access_token ?? "",
    refreshToken: payload.refresh_token ?? fallbackRefresh ?? null,
    expiresAt,
    scope: payload.scope,
    tokenType: payload.token_type,
  };
};

export const refreshGoogleAccessToken = async (
  refreshToken: string
): Promise<StoredGoogleTokens | null> => {
  if (!isGoogleCalendarConfigured()) {
    throw new Error("Google Calendar is not configured");
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: GOOGLE_CLIENT_ID!,
    client_secret: GOOGLE_CLIENT_SECRET!,
    grant_type: "refresh_token",
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    return null;
  }

  const payload: OAuthTokensResponse = await response.json();
  return normalizeTokenPayload(payload, refreshToken);
};

type CalendarEventPayload = {
  id: string;
  summary: string;
  description?: string | null;
  startIso: string;
  endIso: string;
  location?: string | null;
};

export const upsertCalendarEvent = async (
  tokens: Pick<StoredGoogleTokens, "accessToken">,
  calendarId: string,
  event: CalendarEventPayload
) => {
  const postUrl = `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events`;
  const icalUid = `${event.id}@serviceflow`;

  const payload = {
    summary: event.summary,
    description: event.description ?? undefined,
    start: { dateTime: event.startIso },
    end: { dateTime: event.endIso },
    location: event.location ?? undefined,
  };

  // Look up existing event by iCalUID.
  const existingId = await getEventIdByICalUID(tokens, calendarId, icalUid);

  if (existingId) {
    const updateUrl = `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingId)}`;
    const patchResponse = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens.accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!patchResponse.ok) {
      const errorText = await patchResponse.text();
      throw new Error(
        `Failed to upsert Google Calendar event (${patchResponse.status}): ${errorText}`
      );
    }

    return { updated: true, created: false };
  }

  // Create a new event with deterministic iCalUID
  const postResponse = await fetch(postUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokens.accessToken}`,
    },
    body: JSON.stringify({ ...payload, iCalUID: icalUid }),
  });

  if (!postResponse.ok) {
    const errorText = await postResponse.text();
    throw new Error(
      `Failed to create Google Calendar event (${postResponse.status}): ${errorText}`
    );
  }

  return { updated: false, created: true };
};

export const buildGoogleEventId = (appointmentId: string) => {
  // Use a sanitized iCalUID-compatible identifier
  return `sf-${appointmentId}`.replace(/[^a-zA-Z0-9]/g, "").slice(0, 255) || `sf-${Date.now()}`;
};

const getEventIdByICalUID = async (
  tokens: Pick<StoredGoogleTokens, "accessToken">,
  calendarId: string,
  icalUid: string
): Promise<string | null> => {
  const listUrl = `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(
    calendarId
  )}/events?iCalUID=${encodeURIComponent(icalUid)}&maxResults=1&singleEvents=true&orderBy=startTime`;

  const response = await fetch(listUrl, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const data: { items?: Array<{ id?: string }> } = await response.json().catch(() => ({}));
  const match = data.items?.find((item) => item.id);
  return match?.id ?? null;
};

export const deleteGoogleEventByICalUID = async (
  tokens: Pick<StoredGoogleTokens, "accessToken">,
  calendarId: string,
  icalUid: string
) => {
  const eventId = await getEventIdByICalUID(tokens, calendarId, icalUid);
  if (!eventId) {
    return { deleted: false, reason: "not_found" };
  }

  const deleteUrl = `${GOOGLE_CALENDAR_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const response = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(
      `Failed to delete Google Calendar event (${response.status}): ${errorText}`
    );
  }

  return { deleted: true };
};
