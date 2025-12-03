import { Router } from 'express';
import {
  buildGoogleEventId,
  isGoogleCalendarConfigured,
  refreshGoogleAccessToken,
  upsertCalendarEvent,
  buildGoogleCalendarAuthUrl,
  exchangeCodeForTokens,
  deleteGoogleEventByICalUID,
} from '../lib/google-calendar';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError, UnauthorizedError, AppError } from '../lib/errors';
import { randomUUID } from 'crypto';
import * as GoogleCalendarTokenRepository from '../repositories/google-calendar-token-repository';

const router = Router();

const stateToJson = (state: string) => {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
};

const buildState = (data: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(data)).toString('base64url');

type AppointmentCalendarEvent = {
  id: string;
  dealName: string;
  scheduledStart: string;
  scheduledEnd: string;
  stage: string | null;
  assignedTo: string | null;
  salesperson: string | null;
  notes: string | null;
  location?: string | null;
};

const isValidIso = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
};

router.get(
  '/connection',
  asyncHandler(async (req, res) => {
    if (!isGoogleCalendarConfigured()) {
      throw new AppError('Google Calendar is not configured.', 503);
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Missing user context.');
    }

    const data = await GoogleCalendarTokenRepository.getTokenByUserId(userId);

    const connected = Boolean(data?.refresh_token);
    res.json({
      connected,
      expiresAt: data?.access_token_expires_at ?? null,
    });
  })
);

router.get('/auth', (req, res) => {
  if (!isGoogleCalendarConfigured()) {
    return res.status(503).json({ error: 'Google Calendar is not configured.' });
  }

  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ error: 'Missing user context.' });
  }

  const redirectTo = (req.query.redirectTo || '/jobs/calendar').toString();
  const safeRedirect = redirectTo.startsWith('/') ? redirectTo : '/jobs/calendar';
  const state = buildState({
    userId,
    redirectTo: safeRedirect,
    nonce: randomUUID(),
  });

  const authUrl = buildGoogleCalendarAuthUrl(state);
  res.redirect(authUrl);
});

router.post(
  '/disconnect',
  asyncHandler(async (req, res) => {
    if (!isGoogleCalendarConfigured()) {
      throw new AppError('Google Calendar is not configured.', 503);
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Missing user context.');
    }

    await GoogleCalendarTokenRepository.deleteTokenByUserId(userId);

    res.json({ disconnected: true });
  })
);

router.get(
  '/callback',
  asyncHandler(async (req, res) => {
    if (!isGoogleCalendarConfigured()) {
      throw new AppError('Google Calendar is not configured.', 503);
    }

    const code = req.query.code?.toString();
    const stateParam = req.query.state?.toString();

    if (!code || !stateParam) {
      throw new ValidationError('Missing OAuth parameters.');
    }

    const state = stateToJson(stateParam);
    if (!state || !state.userId) {
      throw new ValidationError('Invalid OAuth state.');
    }

    const userId = state.userId;
    const redirectTo = typeof state.redirectTo === 'string' && state.redirectTo.startsWith('/')
      ? state.redirectTo
      : '/jobs/calendar';

    try {
      const tokens = await exchangeCodeForTokens(code);

      const existing = await GoogleCalendarTokenRepository.getTokenByUserId(userId);

      const refreshToken = tokens.refreshToken ?? existing?.refresh_token ?? null;

      if (!refreshToken) {
        throw new ValidationError('Google did not return a refresh token. Please try again.');
      }

      await GoogleCalendarTokenRepository.upsertToken({
        user_id: userId,
        refresh_token: refreshToken,
        access_token: tokens.accessToken,
        access_token_expires_at: tokens.expiresAt
          ? new Date(tokens.expiresAt).toISOString()
          : null,
        scope: tokens.scope ?? null,
        token_type: tokens.tokenType ?? null,
      });
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      console.error('Google OAuth callback failed', error);
      throw new AppError('Failed to complete Google authorization.', 502);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const target = `${appUrl}${redirectTo}`;
    return res.redirect(target);
  })
);

router.post(
  '/sync',
  asyncHandler(async (req, res) => {
    if (!isGoogleCalendarConfigured()) {
      throw new AppError('Google Calendar is not configured.', 503);
    }

    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedError('Missing user context for sync.');
    }

    const eventsRaw = Array.isArray(req.body?.events) ? req.body.events : [];
    const events: AppointmentCalendarEvent[] = eventsRaw.filter(
      (event: any): event is AppointmentCalendarEvent =>
        Boolean(
          event &&
            event.id &&
            event.dealName &&
            event.scheduledStart &&
            event.scheduledEnd &&
            isValidIso(event.scheduledStart) &&
            isValidIso(event.scheduledEnd)
        )
    );

    if (events.length === 0) {
      throw new ValidationError('No valid appointments to sync.');
    }

    const tokenRow = await GoogleCalendarTokenRepository.getTokenByUserId(userId);

    if (!tokenRow?.refresh_token) {
      throw new ValidationError('Connect Google Calendar first.');
    }

    let accessToken: string | null = tokenRow.access_token;
    let refreshToken: string = tokenRow.refresh_token;
    let expiresAt: number | null = tokenRow.access_token_expires_at
      ? Date.parse(tokenRow.access_token_expires_at)
      : null;

    const shouldRefresh = !accessToken || (expiresAt && expiresAt < Date.now() + 60_000);

    if (shouldRefresh) {
      const refreshed = await refreshGoogleAccessToken(refreshToken);
      if (!refreshed || !refreshed.accessToken) {
        throw new UnauthorizedError('Google authorization expired. Please reconnect.');
      }

      accessToken = refreshed.accessToken;
      refreshToken = refreshed.refreshToken ?? refreshToken;
      expiresAt = refreshed.expiresAt ?? null;

      await GoogleCalendarTokenRepository.upsertToken({
        user_id: userId,
        refresh_token: refreshToken,
        access_token: accessToken,
        access_token_expires_at: expiresAt
          ? new Date(expiresAt).toISOString()
          : null,
        scope: refreshed.scope ?? tokenRow.scope ?? null,
        token_type: refreshed.tokenType ?? tokenRow.token_type ?? null,
      });
    }

    const results = { created: 0, updated: 0, failed: 0 };

    for (const event of events) {
      const descriptionParts = [
        event.stage ? `Stage: ${event.stage}` : null,
        event.assignedTo ? `Assigned to: ${event.assignedTo}` : null,
        event.salesperson ? `Salesperson: ${event.salesperson}` : null,
        event.notes ? `Notes: ${event.notes}` : null,
      ].filter(Boolean);

      const payload = {
        id: buildGoogleEventId(event.id),
        summary: event.dealName || 'Appointment',
        description: descriptionParts.join('\n') || null,
        startIso: new Date(event.scheduledStart).toISOString(),
        endIso: new Date(event.scheduledEnd).toISOString(),
        location: event.location ?? undefined,
      };

      try {
        const result = await upsertCalendarEvent(
          { accessToken: accessToken! },
          'primary',
          payload
        );
        if (result.created) {
          results.created += 1;
        } else {
          results.updated += 1;
        }
      } catch (error) {
        console.error('Failed to sync event to Google Calendar', error);
        results.failed += 1;
      }
    }

    const synced = results.created + results.updated;
    const statusCode = results.failed > 0 ? 207 : 200;

    res.status(statusCode).json({
      synced,
      ...results,
      message:
        results.failed === 0
          ? `Synced ${synced} appointments to Google Calendar.`
          : `Synced ${synced} appointments; ${results.failed} failed.`,
    });
  })
);

export default router;
