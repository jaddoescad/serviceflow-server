import { createClient } from "npm:@supabase/supabase-js";

type DealPipelineId = "sales" | "jobs";
type DripChannel = "email" | "sms" | "both";
type DripDelayType = "immediate" | "after";
type DripDelayUnit = "minutes" | "hours" | "days" | "weeks" | "months";

type ScheduleDripsRequest = {
  dealId?: string;
  stageId?: string;
  trigger?: "deal_created" | "stage_changed" | "manual_toggle" | "manual_cancel";
  enableDrips?: boolean;
  cancelExistingJobs?: boolean;
};

type DealRow = {
  id: string;
  company_id: string;
  stage: string;
  disable_drips: boolean;
  first_name: string | null;
  last_name: string | null;
};

type DripStepRow = {
  id: string;
  position: number;
  delay_type: DripDelayType;
  delay_value: number;
  delay_unit: DripDelayUnit;
  channel: DripChannel;
  email_subject: string | null;
  email_body: string | null;
  sms_body: string | null;
};

type DripSequenceRow = {
  id: string;
  company_id: string;
  stage_id: string;
  pipeline_id: DealPipelineId;
  name: string;
  is_enabled: boolean;
  steps?: DripStepRow[];
};

const DRIP_SEQUENCE_TABLE = "drip_sequences";
const DRIP_STEP_TABLE = "drip_steps";
const DRIP_JOB_TABLE = "deal_drip_jobs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "OPTIONS,POST",
};

const DRIP_STEP_SELECT_FIELDS = [
  "id",
  "position",
  "delay_type",
  "delay_value",
  "delay_unit",
  "channel",
  "email_subject",
  "email_body",
  "sms_body",
].join(", ");

const STAGE_PIPELINE_MAP: Record<string, DealPipelineId> = {
  cold_leads: "sales",
  estimate_scheduled: "sales",
  in_draft: "sales",
  proposals_sent: "sales",
  proposals_rejected: "sales",
  project_accepted: "jobs",
  project_scheduled: "jobs",
  project_in_progress: "jobs",
  project_complete: "jobs",
};

const addDelay = (value: number, unit: DripDelayUnit, from: Date): Date => {
  const result = new Date(from);

  switch (unit) {
    case "minutes":
      result.setMinutes(result.getMinutes() + value);
      return result;
    case "hours":
      result.setHours(result.getHours() + value);
      return result;
    case "days":
      result.setDate(result.getDate() + value);
      return result;
    case "weeks":
      result.setDate(result.getDate() + value * 7);
      return result;
    case "months":
      result.setMonth(result.getMonth() + value);
      return result;
    default:
      return result;
  }
};

const getEnv = (key: string) => {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let payload: ScheduleDripsRequest;

  try {
    payload = await request.json();
  } catch (error) {
    console.error("Failed to parse schedule-drips payload", error);
    return Response.json(
      { error: "Invalid JSON body." },
      { status: 400, headers: corsHeaders }
    );
  }

  const { dealId, stageId, trigger, enableDrips } = payload;

  if (!dealId || !stageId || typeof enableDrips !== "boolean" || !trigger) {
    return Response.json(
      { error: "dealId, stageId, enableDrips, and trigger are required." },
      { status: 400, headers: corsHeaders }
    );
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

  const authHeader = request.headers.get("Authorization") ?? "";

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error("Failed to fetch authenticated user", userError);
    return Response.json(
      { error: "Unable to validate user." },
      { status: 401, headers: corsHeaders }
    );
  }

  if (!user) {
    return Response.json(
      { error: "Unauthorized." },
      { status: 401, headers: corsHeaders }
    );
  }

  const { data: deal, error: dealError } = await adminClient
    .from("deals")
    .select("id, company_id, stage, disable_drips, first_name, last_name")
    .eq("id", dealId)
    .maybeSingle<DealRow>();

  if (dealError) {
    console.error("Failed to load deal", dealError);
    return Response.json(
      { error: "Deal not found." },
      { status: 404, headers: corsHeaders }
    );
  }

  if (!deal) {
    return Response.json(
      { error: "Deal not found." },
      { status: 404, headers: corsHeaders }
    );
  }

  const { data: ownerRecord } = await adminClient
    .from("companies")
    .select("id")
    .eq("id", deal.company_id)
    .eq("user_id", user.id)
    .maybeSingle();

  let hasAccess = Boolean(ownerRecord);

  if (!hasAccess) {
    const { data: membershipRecord } = await adminClient
      .from("company_members")
      .select("id")
      .eq("company_id", deal.company_id)
      .eq("user_id", user.id)
      .maybeSingle();

    hasAccess = Boolean(membershipRecord);
  }

  if (!hasAccess) {
    return Response.json(
      { error: "You do not have permission to manage drips for this company." },
      { status: 403, headers: corsHeaders }
    );
  }

  const pipeline: DealPipelineId = STAGE_PIPELINE_MAP[stageId] ?? "sales";
  const shouldCancelExistingJobs = typeof payload.cancelExistingJobs === "boolean"
    ? payload.cancelExistingJobs
    : trigger === "stage_changed" || trigger === "deal_created";

  const { data: sequenceData, error: sequenceError } = await adminClient
    .from(DRIP_SEQUENCE_TABLE)
    .select(
      `id, company_id, stage_id, pipeline_id, name, is_enabled, steps:${DRIP_STEP_TABLE}(${DRIP_STEP_SELECT_FIELDS})`
    )
    .eq("company_id", deal.company_id)
    .eq("stage_id", stageId)
    .eq("pipeline_id", pipeline)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<DripSequenceRow>();

  if (sequenceError) {
    console.error("Failed to load drip sequence", sequenceError);
    return Response.json(
      { error: "Unable to load drip sequence." },
      { status: 500, headers: corsHeaders }
    );
  }

  let sequence = sequenceData ?? null;

  if (!sequence) {
    const { data: insertedSequence, error: insertSequenceError } = await adminClient
      .from(DRIP_SEQUENCE_TABLE)
      .insert({
        company_id: deal.company_id,
        stage_id: stageId,
        pipeline_id: pipeline,
        name: `${stageId} Drip`,
        is_enabled: enableDrips,
      })
      .select(
        `id, company_id, stage_id, pipeline_id, name, is_enabled, steps:${DRIP_STEP_TABLE}(${DRIP_STEP_SELECT_FIELDS})`
      )
      .maybeSingle<DripSequenceRow>();

    if (insertSequenceError) {
      console.error("Failed to create drip sequence", insertSequenceError);
      return Response.json(
        { error: "Unable to create a drip sequence for this stage." },
        { status: 500, headers: corsHeaders }
      );
    }

    sequence = insertedSequence ?? null;
  }

  if (!sequence) {
    return Response.json(
      { error: "Drip sequence unavailable." },
      { status: 500, headers: corsHeaders }
    );
  }

  const { data: existingJobs, error: pendingJobsError } = await adminClient
    .from(DRIP_JOB_TABLE)
    .select("id, stage_id")
    .eq("deal_id", deal.id)
    .in("status", ["pending", "processing"]);

  if (pendingJobsError) {
    console.error("Failed to load existing drip jobs", pendingJobsError);
    return Response.json(
      { error: "Unable to load existing drips." },
      { status: 500, headers: corsHeaders }
    );
  }

  const pendingJobs = existingJobs ?? [];
  const reusableJobs = shouldCancelExistingJobs
    ? []
    : pendingJobs.filter((job) => job.stage_id === stageId);
  const resumedExistingJobs = reusableJobs.length > 0;
  let cancelledCount = 0;

  if (shouldCancelExistingJobs && pendingJobs.length > 0) {
    const { data: cancelledJobs, error: cancelError } = await adminClient
      .from(DRIP_JOB_TABLE)
      .update({ status: "cancelled", last_error: null })
      .eq("deal_id", deal.id)
      .in("status", ["pending", "processing"])
      .select("id");

    if (cancelError) {
      console.error("Failed to cancel existing drip jobs", cancelError);
      return Response.json(
        { error: "Unable to reset existing drips." },
        { status: 500, headers: corsHeaders }
      );
    }

    cancelledCount = cancelledJobs?.length ?? 0;
  }

  const shouldEnableSequence = enableDrips
    && !sequence.is_enabled
    && trigger !== "manual_toggle"
    && trigger !== "manual_cancel";

  if (shouldEnableSequence) {
    const { error: enableSequenceError } = await adminClient
      .from(DRIP_SEQUENCE_TABLE)
      .update({ is_enabled: true })
      .eq("id", sequence.id);

    if (enableSequenceError) {
      console.error("Failed to enable drip sequence", enableSequenceError);
      return Response.json(
        { error: "Unable to enable this drip sequence." },
        { status: 500, headers: corsHeaders }
      );
    }

    sequence.is_enabled = true;
  }

  const { error: toggleError } = await adminClient
    .from("deals")
    .update({ disable_drips: !enableDrips })
    .eq("id", deal.id);

  if (toggleError) {
    console.error("Failed to update deal drip flag", toggleError);
    return Response.json(
      { error: "Unable to update deal settings." },
      { status: 500, headers: corsHeaders }
    );
  }

  if (!enableDrips) {
    return Response.json(
      {
        scheduledCount: 0,
        cancelledCount,
        sequenceId: sequence.id,
        resumedExistingJobs,
      },
      { status: 200, headers: corsHeaders }
    );
  }

  if (resumedExistingJobs) {
    return Response.json(
      {
        scheduledCount: 0,
        cancelledCount,
        sequenceId: sequence.id,
        resumedExistingJobs: true,
        warning: sequence.is_enabled ? undefined : "Sequence is disabled. Enable it before scheduling drips.",
      },
      { status: 200, headers: corsHeaders }
    );
  }

  if (!sequence.is_enabled) {
    return Response.json(
      {
        scheduledCount: 0,
        cancelledCount,
        sequenceId: sequence.id,
        resumedExistingJobs: false,
        warning: "Sequence is disabled. Enable it before scheduling drips.",
      },
      { status: 200, headers: corsHeaders }
    );
  }

  const steps = (sequence.steps ?? [])
    .filter((step): step is DripStepRow => Boolean(step))
    .sort((a, b) => a.position - b.position);

  if (steps.length === 0) {
    return Response.json(
      {
        scheduledCount: 0,
        cancelledCount,
        sequenceId: sequence.id,
        resumedExistingJobs: false,
        warning: "No drip steps configured for this stage.",
      },
      { status: 200, headers: corsHeaders }
    );
  }

  const now = new Date();
  const jobs = steps.map((step) => {
    const sendAt = step.delay_type === "immediate"
      ? now
      : addDelay(Math.max(step.delay_value, 0), step.delay_unit, now);

    return {
      company_id: deal.company_id,
      deal_id: deal.id,
      sequence_id: sequence!.id,
      step_id: step.id,
      stage_id: stageId,
      channel: step.channel,
      send_at: sendAt.toISOString(),
      status: "pending" as const,
      message_subject: step.email_subject,
      message_body: step.email_body,
      sms_body: step.sms_body,
    };
  });

  const { data: insertedJobs, error: insertJobsError } = await adminClient
    .from(DRIP_JOB_TABLE)
    .insert(jobs)
    .select("id");

  if (insertJobsError) {
    console.error("Failed to insert drip jobs", insertJobsError);
    return Response.json(
      { error: "Unable to schedule drips." },
      { status: 500, headers: corsHeaders }
    );
  }

  const scheduledCount = insertedJobs?.length ?? 0;

  return Response.json(
    {
      scheduledCount,
      cancelledCount,
      sequenceId: sequence.id,
      resumedExistingJobs: false,
    },
    { status: 200, headers: corsHeaders }
  );
});
