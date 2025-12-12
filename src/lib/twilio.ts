const TWILIO_API_BASE_URL = 'https://api.twilio.com/2010-04-01/Accounts';

export type TwilioNumber = {
  id: string;
  phoneNumber: string;
  formattedNumber: string;
  name?: string | null;
  createdAt?: string | null;
};

type TwilioIncomingPhoneNumber = {
  sid: string;
  phone_number: string;
  friendly_name?: string | null;
  date_created?: string | null;
};

type TwilioIncomingNumbersResponse = {
  incoming_phone_numbers?: TwilioIncomingPhoneNumber[];
  message?: string;
  Message?: string;
  detail?: string;
};

export const normalizeAccountSid = (accountSid: string) => accountSid.trim();
export const normalizeAuthToken = (authToken: string) => authToken.trim();

const toAuthHeader = (accountSid: string, authToken: string) =>
  `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;

const parseTwilioError = async (response: Response) => {
  try {
    const body = (await response.json()) as {
      message?: string;
      Message?: string;
      detail?: string;
      errors?: Array<{ message?: string }>;
    };
    const message =
      body?.message || body?.Message || body?.detail || body?.errors?.[0]?.message;
    if (message) return message;
  } catch (_error) {
    // ignore JSON parsing errors and fall through to the default message
  }

  return `Twilio API request failed with status ${response.status}`;
};

const twilioRequest = async <T>(
  accountSid: string,
  authToken: string,
  path: string,
  init?: RequestInit
): Promise<T> => {
  const sanitizedSid = normalizeAccountSid(accountSid);
  const sanitizedToken = normalizeAuthToken(authToken);

  if (!sanitizedSid || !sanitizedToken) {
    throw new Error('Twilio Account SID and Auth Token are required.');
  }

  const response = await fetch(
    `${TWILIO_API_BASE_URL}/${encodeURIComponent(sanitizedSid)}${path}`,
    {
      method: 'GET',
      ...init,
      headers: {
        Authorization: toAuthHeader(sanitizedSid, sanitizedToken),
        ...(init?.headers || {}),
      },
    }
  );

  if (!response.ok) {
    const message = await parseTwilioError(response);
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
};

const normalizeTwilioNumber = (input: TwilioIncomingPhoneNumber): TwilioNumber => {
  const phoneNumber = input?.phone_number ?? '';

  return {
    id: String(input?.sid ?? ''),
    phoneNumber,
    formattedNumber: phoneNumber,
    name: input?.friendly_name ?? null,
    createdAt: input?.date_created ?? null,
  };
};

export const fetchTwilioNumbers = async (
  accountSid: string,
  authToken: string
): Promise<TwilioNumber[]> => {
  const payload = await twilioRequest<TwilioIncomingNumbersResponse>(
    accountSid,
    authToken,
    '/IncomingPhoneNumbers.json?PageSize=100'
  );
  const numbers = Array.isArray(payload.incoming_phone_numbers)
    ? payload.incoming_phone_numbers
    : [];
  return numbers.map(normalizeTwilioNumber);
};

export const validateTwilioCredentials = async (
  accountSid: string,
  authToken: string
): Promise<void> => {
  await twilioRequest(
    accountSid,
    authToken,
    '/IncomingPhoneNumbers.json?PageSize=1'
  );
};

export const sendTwilioMessage = async (params: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body?: string;
  mediaUrls?: string[];
}) => {
  const { accountSid, authToken, from, to, body, mediaUrls } = params;

  if (!from.trim()) {
    throw new Error('Twilio "from" number is required.');
  }

  if (!to.trim()) {
    throw new Error('Recipient phone number is required.');
  }

  const messageBody = typeof body === 'string' ? body.trim() : '';
  const mediaList = Array.isArray(mediaUrls) ? mediaUrls.filter((url) => typeof url === 'string' && url.trim()) : [];

  if (!messageBody && mediaList.length === 0) {
    throw new Error('Message content or media is required.');
  }

  const form = new URLSearchParams();
  form.set('From', from);
  form.set('To', to);
  if (messageBody) {
    form.set('Body', messageBody);
  }
  for (const url of mediaList) {
    form.append('MediaUrl', url);
  }

  return twilioRequest(accountSid, authToken, '/Messages.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: form.toString(),
  });
};
