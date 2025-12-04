import { createClient } from "npm:@supabase/supabase-js";

type DripChannel = "email" | "sms" | "both";
type DripStatus = "pending" | "processing" | "sent" | "failed" | "cancelled";

type DripJobRow = {
  id: string;
  company_id: string;
  deal_id: string;
  sequence_id: string | null;
  stage_id: string;
  channel: DripChannel;
  send_at: string;
  status: DripStatus;
  message_subject: string | null;
  message_body: string | null;
  sms_body: string | null;
};

type DealRow = {
  id: string;
  company_id: string;
  stage: string;
  salesperson: string | null;
  disable_drips: boolean;
  archived_at: string | null;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  contact_id: string | null;
  contact_address_id: string | null;
};

type AppointmentRow = {
  id: string;
  deal_id: string;
  scheduled_start: string;
  scheduled_end: string;
};

type AddressRow = {
  id: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

type ContactRow = {
  id: string;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
};

type CompanyRow = {
  id: string;
  name: string | null;
  phone_number: string | null;
  website: string | null;
  review_url: string | null;
  openphone_api_key: string | null;
  openphone_phone_number_id: string | null;
  openphone_phone_number: string | null;
  openphone_enabled: boolean | null;
};

type SequenceRow = {
  id: string;
  is_enabled: boolean;
};

const DRIP_JOB_TABLE = "deal_drip_jobs";
const DEAL_TABLE = "deals";
const CONTACT_TABLE = "contacts";
const COMPANY_TABLE = "companies";
const DRIP_SEQUENCE_TABLE = "drip_sequences";
const APPOINTMENT_TABLE = "appointments";
const ADDRESS_TABLE = "contact_addresses";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
};

const POSTMARK_ENDPOINT = "https://api.postmarkapp.com/email";
const OPENPHONE_API_BASE_URL = "https://api.openphone.com/v1";

const getEnv = (key: string, options?: { required?: boolean; defaultValue?: string }) => {
  const value = Deno.env.get(key) ?? options?.defaultValue ?? "";
  if (!value && options?.required !== false) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

const parseJsonBody = async (request: Request) => {
  try {
    return await request.json();
  } catch (_error) {
    return null;
  }
};

const toHtml = (body: string) => body.replace(/\n/g, "<br>");

const parseLimit = (input: unknown) => {
  if (typeof input !== "number" || Number.isNaN(input)) {
    return 25;
  }
  return Math.min(Math.max(Math.floor(input), 1), 200);
};

const normalizePhone = (value: string | null | undefined) => (value ?? "").trim();

const normalizeOpenPhoneKey = (value: string | null | undefined) => (value ?? "").trim().replace(/^Bearer\s+/i, "");

const normalizeTokenKey = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/gi, "")
    .replace(/-/g, "_");

const applyTemplate = (template: string, context: Record<string, string>) => {
  if (!template) return template;

  const tokenPattern = /\{\{\s*([^{}]+)\s*\}\}|\{\s*([^{}]+)\s*\}/g;

  return template.replace(tokenPattern, (_match, doubleKey, singleKey) => {
    const key = normalizeTokenKey(doubleKey ?? singleKey ?? "");
    if (!key) return "";
    const value = context[key];
    return value ?? "";
  });
};

const sendPostmarkEmail = async (params: {
  token: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  messageStream?: string;
}) => {
  const response = await fetch(POSTMARK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Postmark-Server-Token": params.token,
    },
    body: JSON.stringify({
      From: params.from,
      To: params.to,
      Subject: params.subject,
      TextBody: params.body,
      HtmlBody: toHtml(params.body),
      MessageStream: params.messageStream ?? "outbound",
    }),
  });

  if (!response.ok) {
    let message = `Postmark request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      message = payload?.Message ?? payload?.message ?? message;
    } catch (_error) {
      // ignore parsing errors
    }
    throw new Error(message);
  }
};

const sendOpenPhoneMessage = async (params: { apiKey: string; from: string; to: string; content: string }) => {
  const sanitizedKey = normalizeOpenPhoneKey(params.apiKey);
  if (!sanitizedKey) {
    throw new Error("OpenPhone API key is missing.");
  }

  const response = await fetch(`${OPENPHONE_API_BASE_URL}/messages`, {
    method: "POST",
    headers: {
      Authorization: sanitizedKey,
      "X-Api-Key": sanitizedKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      content: params.content,
    }),
  });

  if (!response.ok) {
    let message = `OpenPhone request failed with status ${response.status}`;
    try {
      const payload = await response.json() as { error?: string; message?: string; errors?: Array<{ message?: string }> };
      message = payload.error || payload.message || payload.errors?.[0]?.message || message;
    } catch (_error) {
      // ignore parse errors
    }
    throw new Error(message);
  }
};

const updateJobStatus = async (
  client: ReturnType<typeof createClient>,
  jobId: string,
  patch: Partial<DripJobRow> & { last_error?: string | null; sent_at?: string | null },
  allowedStatuses: DripStatus[] = ["pending", "processing"]
) => {
  const { data, error } = await client
    .from(DRIP_JOB_TABLE)
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .in("status", allowedStatuses)
    .select("id");

  if (error) {
    console.error("Failed to update drip job status", { jobId, patch, error });
    return { updated: 0 };
  }

  return { updated: data?.length ?? 0 };
};

const markProcessing = async (client: ReturnType<typeof createClient>, jobId: string) => {
  const result = await updateJobStatus(client, jobId, { status: "processing" });
  return result.updated > 0;
};

const cancelJob = async (client: ReturnType<typeof createClient>, jobId: string, reason: string) => {
  await updateJobStatus(client, jobId, { status: "cancelled", last_error: reason });
};

const failJob = async (client: ReturnType<typeof createClient>, jobId: string, reason: string) => {
  await updateJobStatus(client, jobId, { status: "failed", last_error: reason });
};

const completeJob = async (client: ReturnType<typeof createClient>, jobId: string) => {
  await updateJobStatus(client, jobId, {
    status: "sent",
    sent_at: new Date().toISOString(),
    last_error: null,
  });
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let supabaseUrl: string;
  let serviceRoleKey: string;

  try {
    supabaseUrl = getEnv("SUPABASE_URL");
    serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Service configuration missing." },
      { status: 500, headers: corsHeaders }
    );
  }

  const executorToken = getEnv("DRIP_EXECUTOR_TOKEN", { required: false }) || serviceRoleKey;
  const authHeader = request.headers.get("Authorization") ?? "";
  const bearerToken = authHeader.replace(/^Bearer\s+/i, "");

  if (!executorToken || bearerToken !== executorToken) {
    return Response.json({ error: "Unauthorized." }, { status: 401, headers: corsHeaders });
  }

  const body = await parseJsonBody(request);
  const limit = parseLimit(body?.limit);
  const nowIso = new Date().toISOString();

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: jobs, error: jobsError } = await adminClient
    .from(DRIP_JOB_TABLE)
    .select(`
      id, company_id, deal_id, sequence_id, stage_id, channel, send_at, status, message_subject, message_body, sms_body,
      deal:deals!inner(id, disable_drips, archived_at),
      sequence:drip_sequences!inner(id, is_enabled)
    `)
    .lte("send_at", nowIso)
    .eq("status", "pending")
    .eq("deal.disable_drips", false)
    .is("deal.archived_at", null)
    .eq("sequence.is_enabled", true)
    .order("send_at", { ascending: true })
    .limit(limit);

  if (jobsError) {
    console.error("Failed to load pending drip jobs", jobsError);
    return Response.json(
      { error: "Unable to load drip jobs." },
      { status: 500, headers: corsHeaders }
    );
  }

  if (!jobs || jobs.length === 0) {
    return Response.json(
      { processed: 0, sent: 0, failed: 0, cancelled: 0, skipped: 0 },
      { status: 200, headers: corsHeaders }
    );
  }

  const dealIds = Array.from(new Set(jobs.map((job) => job.deal_id)));
  const companyIds = Array.from(new Set(jobs.map((job) => job.company_id)));
  const sequenceIds = Array.from(new Set(jobs.map((job) => job.sequence_id).filter(Boolean))) as string[];

  const dealMap = new Map<string, DealRow>();
  const contactMap = new Map<string, ContactRow>();
  const companyMap = new Map<string, CompanyRow>();
  const sequenceMap = new Map<string, SequenceRow>();
  const appointmentMap = new Map<string, AppointmentRow>();
  const addressMap = new Map<string, AddressRow>();

  if (dealIds.length > 0) {
    const { data: deals, error } = await adminClient
      .from(DEAL_TABLE)
      .select("id, company_id, stage, salesperson, disable_drips, archived_at, email, phone, first_name, last_name, contact_id, contact_address_id")
      .in("id", dealIds);

    if (error) {
      console.error("Failed to load deals for drips", error);
      return Response.json({ error: "Unable to hydrate drip jobs." }, { status: 500, headers: corsHeaders });
    }

    for (const deal of deals ?? []) {
      dealMap.set(deal.id, deal as DealRow);
    }

    const contactIds = Array.from(
      new Set(
        (deals ?? [])
          .map((deal) => deal.contact_id)
          .filter(Boolean)
      )
    ) as string[];

    if (contactIds.length > 0) {
      const { data: contacts, error: contactsError } = await adminClient
        .from(CONTACT_TABLE)
        .select("id, email, phone, first_name, last_name")
        .in("id", contactIds);

      if (contactsError) {
        console.error("Failed to load contacts for drips", contactsError);
        return Response.json({ error: "Unable to hydrate contacts for drips." }, { status: 500, headers: corsHeaders });
      }

      for (const contact of contacts ?? []) {
        contactMap.set(contact.id, contact as ContactRow);
      }
    }

    // Fetch latest appointment for each deal
    const { data: appointments, error: appointmentsError } = await adminClient
      .from(APPOINTMENT_TABLE)
      .select("id, deal_id, scheduled_start, scheduled_end")
      .in("deal_id", dealIds)
      .order("scheduled_start", { ascending: false });

    if (appointmentsError) {
      console.error("Failed to load appointments for drips", appointmentsError);
      // Non-fatal: continue without appointment data
    } else {
      // Store only the latest appointment per deal
      for (const apt of appointments ?? []) {
        if (!appointmentMap.has(apt.deal_id)) {
          appointmentMap.set(apt.deal_id, apt as AppointmentRow);
        }
      }
    }

    // Fetch addresses for deals
    const addressIds = Array.from(
      new Set(
        (deals ?? [])
          .map((deal) => deal.contact_address_id)
          .filter(Boolean)
      )
    ) as string[];

    if (addressIds.length > 0) {
      const { data: addresses, error: addressesError } = await adminClient
        .from(ADDRESS_TABLE)
        .select("id, address_line1, address_line2, city, state, postal_code")
        .in("id", addressIds);

      if (addressesError) {
        console.error("Failed to load addresses for drips", addressesError);
        // Non-fatal: continue without address data
      } else {
        for (const addr of addresses ?? []) {
          addressMap.set(addr.id, addr as AddressRow);
        }
      }
    }
  }

  if (companyIds.length > 0) {
    const { data: companies, error } = await adminClient
      .from(COMPANY_TABLE)
      .select("id, name, phone_number, website, review_url, openphone_api_key, openphone_phone_number_id, openphone_phone_number, openphone_enabled")
      .in("id", companyIds);

    if (error) {
      console.error("Failed to load companies for drips", error);
      return Response.json({ error: "Unable to hydrate company settings." }, { status: 500, headers: corsHeaders });
    }

    for (const company of companies ?? []) {
      companyMap.set(company.id, company as CompanyRow);
    }
  }

  if (sequenceIds.length > 0) {
    const { data: sequences, error } = await adminClient
      .from(DRIP_SEQUENCE_TABLE)
      .select("id, is_enabled")
      .in("id", sequenceIds);

    if (error) {
      console.error("Failed to load drip sequences", error);
      return Response.json({ error: "Unable to hydrate drip sequences." }, { status: 500, headers: corsHeaders });
    }

    for (const sequence of sequences ?? []) {
      sequenceMap.set(sequence.id, sequence as SequenceRow);
    }
  }

  const results = {
    processed: 0,
    sent: 0,
    failed: 0,
    cancelled: 0,
    skipped: 0,
  };

  const postmarkToken = getEnv("POSTMARK_SERVER_TOKEN", { required: false });
  const postmarkFromEmail = getEnv("POSTMARK_FROM_EMAIL", { required: false });
  const postmarkMessageStream = getEnv("POSTMARK_MESSAGE_STREAM", { required: false }) || "outbound";

  for (const job of jobs as DripJobRow[]) {
    const deal = dealMap.get(job.deal_id);
    const contact = deal?.contact_id ? contactMap.get(deal.contact_id) ?? null : null;
    const company = companyMap.get(job.company_id) ?? null;
    const sequence = job.sequence_id ? sequenceMap.get(job.sequence_id) ?? null : null;

    if (!deal) {
      await cancelJob(adminClient, job.id, "Deal missing for drip job.");
      results.cancelled += 1;
      results.processed += 1;
      continue;
    }

    if (deal.archived_at) {
      await cancelJob(adminClient, job.id, "Deal has been archived.");
      results.cancelled += 1;
      results.processed += 1;
      continue;
    }

    if (deal.stage !== job.stage_id) {
      await cancelJob(adminClient, job.id, "Deal moved to a different stage.");
      results.cancelled += 1;
      results.processed += 1;
      continue;
    }

    if (deal.disable_drips) {
      results.skipped += 1;
      continue;
    }

    if (!sequence) {
      await cancelJob(adminClient, job.id, "Drip sequence not found.");
      results.cancelled += 1;
      results.processed += 1;
      continue;
    }

    if (!sequence.is_enabled) {
      results.skipped += 1;
      continue;
    }

    const shouldSendEmail = job.channel === "email" || job.channel === "both";
    const shouldSendSms = job.channel === "sms" || job.channel === "both";

    const toEmail = (deal.email ?? contact?.email ?? "").trim();
    const toPhone = normalizePhone(deal.phone ?? contact?.phone);

    const salesPerson = (deal.salesperson || "").trim();

    // Get appointment and address data for this deal
    const appointment = appointmentMap.get(deal.id) ?? null;
    const address = deal.contact_address_id ? addressMap.get(deal.contact_address_id) ?? null : null;

    // Format appointment date and time
    const formatAppointmentDate = (isoDate: string | null): string => {
      if (!isoDate) return "";
      try {
        const date = new Date(isoDate);
        return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      } catch {
        return "";
      }
    };

    const formatAppointmentTime = (isoDate: string | null): string => {
      if (!isoDate) return "";
      try {
        const date = new Date(isoDate);
        return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
      } catch {
        return "";
      }
    };

    // Format address as location string
    const formatAddress = (addr: AddressRow | null): string => {
      if (!addr) return "";
      const parts = [
        addr.address_line1,
        addr.address_line2,
        [addr.city, addr.state].filter(Boolean).join(", "),
        addr.postal_code,
      ].filter(Boolean);
      return parts.join(", ");
    };

    const templateContext = {
      first_name: (contact?.first_name || deal.first_name || "").trim(),
      last_name: (contact?.last_name || deal.last_name || "").trim(),
      client_name: [
        (contact?.first_name || deal.first_name || "").trim(),
        (contact?.last_name || deal.last_name || "").trim(),
      ]
        .filter(Boolean)
        .join(" ")
        .trim(),
      company_name: (company?.name || "").trim(),
      company_phone: (company?.phone_number || "").trim(),
      company_website: (company?.website || "").trim(),
      sales_person: salesPerson,
      salesperson: salesPerson,
      salesperson_name: salesPerson,
      deal_stage: job.stage_id ?? "",
      deal_name: [
        (contact?.first_name || deal.first_name || "").trim(),
        (contact?.last_name || deal.last_name || "").trim(),
      ]
        .filter(Boolean)
        .join(" ")
        .trim(),
      // Appointment variables
      appointment_date: formatAppointmentDate(appointment?.scheduled_start ?? null),
      appointment_time: formatAppointmentTime(appointment?.scheduled_start ?? null),
      appointment_location: formatAddress(address),
      // Job/project date (same as appointment for scheduled projects)
      job_date: formatAppointmentDate(appointment?.scheduled_start ?? null),
      // Review URL (templates use {review-button} which normalizes to review_button)
      review_button: (company?.review_url || "").trim(),
    };

    const resolvedSubject = job.message_subject ? applyTemplate(job.message_subject, templateContext) : null;
    const resolvedEmailBody = job.message_body ? applyTemplate(job.message_body, templateContext) : null;
    const resolvedSmsBody = job.sms_body ? applyTemplate(job.sms_body, templateContext) : null;

    const canSendEmail = shouldSendEmail && resolvedSubject && resolvedEmailBody && toEmail && postmarkToken && postmarkFromEmail;
    const canSendSms = shouldSendSms && resolvedSmsBody && toPhone && company?.openphone_enabled && company?.openphone_api_key;

    const markAsProcessing = canSendEmail || canSendSms;

    if (!markAsProcessing) {
      await failJob(
        adminClient,
        job.id,
        "Unable to send drip: missing channel configuration or recipient details."
      );
      results.failed += 1;
      results.processed += 1;
      continue;
    }

    const locked = await markProcessing(adminClient, job.id);
    if (!locked) {
      results.skipped += 1;
      continue;
    }

    const sendErrors: string[] = [];

    if (shouldSendEmail) {
      if (!postmarkToken) {
        sendErrors.push("Postmark token missing.");
      } else if (!postmarkFromEmail) {
        sendErrors.push("Postmark From email is missing.");
      } else if (!resolvedSubject || !resolvedEmailBody) {
        sendErrors.push("Email subject or body missing.");
      } else if (!toEmail) {
        sendErrors.push("Recipient email missing.");
      } else {
        try {
          await sendPostmarkEmail({
            token: postmarkToken,
            from: postmarkFromEmail,
            to: toEmail,
            subject: resolvedSubject,
            body: resolvedEmailBody,
            messageStream: postmarkMessageStream,
          });
        } catch (error) {
          console.error("Failed to send drip email", { jobId: job.id, error });
          sendErrors.push(error instanceof Error ? error.message : "Email send failed.");
        }
      }
    }

    if (shouldSendSms) {
      const openPhoneKey = company?.openphone_api_key ?? "";
      const fromValue = company?.openphone_phone_number_id?.trim() || company?.openphone_phone_number?.trim() || "";
      if (!company?.openphone_enabled || !openPhoneKey) {
        sendErrors.push("OpenPhone is not configured.");
      } else if (!resolvedSmsBody) {
        sendErrors.push("SMS body missing.");
      } else if (!toPhone) {
        sendErrors.push("Recipient phone missing.");
      } else if (!fromValue) {
        sendErrors.push("OpenPhone sender number missing.");
      } else {
        try {
          await sendOpenPhoneMessage({
            apiKey: openPhoneKey,
            from: fromValue,
            to: toPhone,
            content: resolvedSmsBody,
          });
        } catch (error) {
          console.error("Failed to send drip SMS", { jobId: job.id, error });
          sendErrors.push(error instanceof Error ? error.message : "SMS send failed.");
        }
      }
    }

    if (sendErrors.length > 0) {
      await failJob(adminClient, job.id, sendErrors.join(" | "));
      results.failed += 1;
      results.processed += 1;
      continue;
    }

    await completeJob(adminClient, job.id);
    results.sent += 1;
    results.processed += 1;
  }

  return Response.json(results, { status: 200, headers: corsHeaders });
});
