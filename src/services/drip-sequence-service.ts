import * as DripSequenceRepository from '../repositories/drip-sequence-repository';
import * as RpcRepository from '../repositories/rpc-repository';

/**
 * Drip Sequence Service
 * Handles business logic for drip sequences
 */

/**
 * Fetch a drip sequence with its steps, throwing an error if not found
 */
export async function fetchSequenceWithSteps(sequenceId: string) {
  const sequence = await DripSequenceRepository.getDripSequenceById(sequenceId);

  if (!sequence) {
    throw new Error('Drip sequence not found');
  }

  return sequence;
}

type DripDelayType = 'immediate' | 'after';
type DripDelayUnit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
type DripChannel = 'email' | 'sms' | 'both';

type DefaultDripStep = {
  position: number;
  delay_type: DripDelayType;
  delay_value: number;
  delay_unit: DripDelayUnit;
  channel: DripChannel;
  email_subject?: string | null;
  email_body?: string | null;
  sms_body?: string | null;
};

type DefaultDripSequence = {
  pipeline_id: 'sales' | 'jobs';
  stage_id: string;
  name: string;
  is_enabled: boolean;
  steps: DefaultDripStep[];
};

export const DEFAULT_DRIP_SEQUENCES: DefaultDripSequence[] = [
  {
    pipeline_id: 'sales',
    stage_id: 'cold_leads',
    name: 'Aggressive New Lead Follow Up',
    is_enabled: true,
    steps: [
      {
        position: 1,
        delay_type: 'immediate',
        delay_value: 0,
        delay_unit: 'minutes',
        channel: 'both',
        email_subject: 're: Your Quote Request',
        email_body:
          "Hi {first-name}, it's {salesperson-name} with {company-name}. Thanks for the request. What day this week works best for you for a free on-site estimate?",
        sms_body:
          "Hi {first-name}, it's {salesperson-name} with {company-name}. Thanks for the request. What day this week works best for you for a Free on-site estimate?",
      },
      {
        position: 2,
        delay_type: 'after',
        delay_value: 2,
        delay_unit: 'days',
        channel: 'email',
        email_subject: "We're eager to help!",
        email_body:
          'We want to get your free on-site estimate scheduled this week. What day and time works best for you?',
      },
      {
        position: 3,
        delay_type: 'after',
        delay_value: 3,
        delay_unit: 'days',
        channel: 'sms',
        email_subject: null,
        email_body: null,
        sms_body: "Hi {first-name}, we'd love to book your estimate. Would Wednesday be a good time for you?",
      },
      {
        position: 4,
        delay_type: 'after',
        delay_value: 3,
        delay_unit: 'days',
        channel: 'email',
        email_subject: 'Are you still interested in getting a quote?',
        email_body:
          "Just checking to see if you're still interested in getting a quote. We can come out for a quick estimate whenever works best for you.",
      },
      {
        position: 5,
        delay_type: 'after',
        delay_value: 5,
        delay_unit: 'days',
        channel: 'email',
        email_subject: 're: availability this week',
        email_body: 'I still have openings this week to come by for your estimate. Want me to hold a spot for you?',
      },
      {
        position: 6,
        delay_type: 'after',
        delay_value: 7,
        delay_unit: 'days',
        channel: 'email',
        email_subject: 'Responding to your quote request',
        email_body: 'Following up on your quote request. If you want to move forward, let me know what day and time works.',
      },
      {
        position: 7,
        delay_type: 'after',
        delay_value: 14,
        delay_unit: 'days',
        channel: 'email',
        email_subject: 'What date and time works for you?',
        email_body: 'We can still help with your project. What date and time are best for a quick walkthrough?',
      },
      {
        position: 8,
        delay_type: 'after',
        delay_value: 30,
        delay_unit: 'days',
        channel: 'email',
        email_subject: 're: follow up',
        email_body:
          "Checking in one last time about your project. If you're still looking for a quote, reply and we'll schedule it.",
      },
    ],
  },
  {
    pipeline_id: 'sales',
    stage_id: 'estimate_scheduled',
    name: 'Appointment Information',
    is_enabled: true,
    steps: [
      {
        position: 1,
        delay_type: 'immediate',
        delay_value: 0,
        delay_unit: 'minutes',
        channel: 'both',
        email_subject: 'Your Appointment Confirmation with {company-name}',
        email_body:
          'Hi! Your appointment with {company-name} has been scheduled for {appointment-date} at {appointment-time} at {appointment-location}. Please let us know if you have any questions or need to make changes! Thanks - {salesperson-name}',
        sms_body:
          'Hi! Your appointment with {company-name} has been scheduled: {appointment-date} {appointment-time} {appointment-location} please let us know if you have any questions or need to make changes! Thanks - {salesperson-name}',
      },
    ],
  },
  {
    pipeline_id: 'sales',
    stage_id: 'in_draft',
    name: 'Proposal Draft',
    is_enabled: true,
    steps: [
      {
        position: 1,
        delay_type: 'after',
        delay_value: 1,
        delay_unit: 'days',
        channel: 'email',
        email_subject: "We're working on your proposal!",
        email_body:
          "Thanks for meeting with us. We're working on your proposal and will share it soon. If there are details you want us to include, let me know.",
      },
    ],
  },
  {
    pipeline_id: 'sales',
    stage_id: 'proposals_sent',
    name: 'Passive Proposal Follow Up',
    is_enabled: true,
    steps: [
      {
        position: 1,
        delay_type: 'after',
        delay_value: 2,
        delay_unit: 'hours',
        channel: 'email',
        email_subject: 'Thank you for the opportunity!',
        email_body:
          'Hi {first-name}, thank you for the opportunity to bid your project. I just sent over your proposal. Let me know if you have any questions.',
      },
      {
        position: 2,
        delay_type: 'after',
        delay_value: 1,
        delay_unit: 'days',
        channel: 'email',
        email_subject: 'Have you had a chance to review the proposal?',
        email_body:
          "Just checking in to see if you've had a chance to review the proposal. I'm happy to walk through it together.",
      },
      {
        position: 3,
        delay_type: 'after',
        delay_value: 2,
        delay_unit: 'days',
        channel: 'sms',
        email_subject: null,
        email_body: null,
        sms_body: "Hey, {first-name}! Did you have any questions regarding the quote I sent you?",
      },
      {
        position: 4,
        delay_type: 'after',
        delay_value: 4,
        delay_unit: 'days',
        channel: 'email',
        email_subject: "Ok, we just couldn't wait any longer!",
        email_body:
          "Following up again because we're excited to work with you. Do you have any feedback on the proposal?",
      },
      {
        position: 5,
        delay_type: 'after',
        delay_value: 6,
        delay_unit: 'days',
        channel: 'sms',
        email_subject: null,
        email_body: null,
        sms_body:
          "Hi {first-name}, this is {salesperson-name} from {company-name}. I was reviewing your proposal and we'd love to fit your project into an upcoming spot, but we'd need a deposit today. If I offered a discount, would you let us earn your business?",
      },
      {
        position: 6,
        delay_type: 'after',
        delay_value: 7,
        delay_unit: 'days',
        channel: 'email',
        email_subject: 're: Ready to move forward?',
        email_body: 'Are you ready to move forward on the proposal? I can reserve a start date for you.',
      },
      {
        position: 7,
        delay_type: 'after',
        delay_value: 11,
        delay_unit: 'days',
        channel: 'email',
        email_subject: 'Re: Great news!',
        email_body: 'Great news - we still have a slot available for your project. Want to claim it?',
      },
      {
        position: 8,
        delay_type: 'after',
        delay_value: 14,
        delay_unit: 'days',
        channel: 'email',
        email_subject: 'Is there something stopping you?',
        email_body: "If something is holding you back, let me know. I can adjust the proposal or answer any questions.",
      },
      {
        position: 9,
        delay_type: 'after',
        delay_value: 21,
        delay_unit: 'days',
        channel: 'email',
        email_subject: 'Do we still have a chance?',
        email_body: "Checking in to see if we're still in the running for your project.",
      },
      {
        position: 10,
        delay_type: 'after',
        delay_value: 30,
        delay_unit: 'days',
        channel: 'email',
        email_subject: 're: can you believe this...',
        email_body:
          "It's been a month since we sent your proposal. If you're still deciding, I'd love to help or update the quote.",
      },
    ],
  },
  {
    pipeline_id: 'sales',
    stage_id: 'proposals_rejected',
    name: 'Proposal Rejected Re-Engagement',
    is_enabled: true,
    steps: [
      {
        position: 1,
        delay_type: 'after',
        delay_value: 1,
        delay_unit: 'hours',
        channel: 'email',
        email_subject: 'Your Proposal',
        email_body:
          "I saw the proposal was declined. Could you share what didn't fit? We'd love a chance to adjust.",
      },
      {
        position: 2,
        delay_type: 'after',
        delay_value: 3,
        delay_unit: 'days',
        channel: 'email',
        email_subject: 'What can we do?',
        email_body:
          "If there's anything we can change to win your business, let me know and we'll adjust the proposal.",
      },
    ],
  },
  {
    pipeline_id: 'jobs',
    stage_id: 'project_accepted',
    name: 'Proposal Accepted Sequence',
    is_enabled: true,
    steps: [
      {
        position: 1,
        delay_type: 'after',
        delay_value: 30,
        delay_unit: 'minutes',
        channel: 'email',
        email_subject: 'Re: Thank you!',
        email_body:
          "Thank you for accepting the proposal. We'll follow up shortly with scheduling details and next steps.",
      },
    ],
  },
  {
    pipeline_id: 'jobs',
    stage_id: 'project_scheduled',
    name: 'Project Scheduled Details',
    is_enabled: true,
    steps: [
      {
        position: 1,
        delay_type: 'immediate',
        delay_value: 0,
        delay_unit: 'minutes',
        channel: 'both',
        email_subject: 'Your project with {company-name} has been scheduled',
        email_body:
          "Hi {first-name}, we've tentatively scheduled your project for {job-date}. If any changes to this date occur, we'll let you know promptly. Thank you!",
        sms_body:
          "Hi! This is {salesperson-name} with {company-name}. We've tentatively scheduled your project for {job-date}. If any changes to this date occur, we'll let you know promptly. Thank you!",
      },
    ],
  },
  {
    pipeline_id: 'jobs',
    stage_id: 'project_in_progress',
    name: 'Update (Job Starting)',
    is_enabled: true,
    steps: [
      {
        position: 1,
        delay_type: 'immediate',
        delay_value: 0,
        delay_unit: 'minutes',
        channel: 'sms',
        email_subject: null,
        email_body: null,
        sms_body:
          "Great news! Your project with {company-name} starts tomorrow. If you have any questions, please feel free to text back or call: {company-phone}. Thank you! - {salesperson-name}",
      },
    ],
  },
  {
    pipeline_id: 'jobs',
    stage_id: 'project_complete',
    name: 'Review Request',
    is_enabled: true,
    steps: [
      {
        position: 1,
        delay_type: 'immediate',
        delay_value: 0,
        delay_unit: 'minutes',
        channel: 'email',
        email_subject: "How'd We Do?",
        email_body:
          "Thank you for choosing {company-name}. We'd love your feedback on your experience. If we earned 5 stars, please leave a quick review here: {review-button}",
      },
      {
        position: 2,
        delay_type: 'after',
        delay_value: 30,
        delay_unit: 'minutes',
        channel: 'sms',
        email_subject: null,
        email_body: null,
        sms_body:
          'Hi {first-name}, thanks again for your business! Small ask with a big impact, if we earned a 5-star review, each painter who worked on your project gets a tip. You can leave it here: {review-button}. Thanks again, {salesperson-name}',
      },
      {
        position: 3,
        delay_type: 'after',
        delay_value: 1,
        delay_unit: 'days',
        channel: 'both',
        email_subject: 'Did We Earn Your 5 Stars?',
        email_body:
          "Hi {first-name}, hope you're loving the results! If we earned 5 stars, your review also tips the painters who worked on your project. You can leave it here: {review-button}",
        sms_body:
          "Hi {first-name}, hope you're loving the results! If we earned 5 stars, your review also tips the painters who worked on your project. You can leave it here: {review-button}",
      },
      {
        position: 4,
        delay_type: 'after',
        delay_value: 2,
        delay_unit: 'days',
        channel: 'both',
        email_subject: 'Share Your Experience with Us',
        email_body:
          'Hi {first-name}, thanks for trusting us with your project. If we earned 5 stars, a quick review helps and tips the painters who worked on your job: {review-button}',
        sms_body:
          'Hi {first-name}, thanks for trusting us with your project. If we earned 5 stars, a quick review helps and tips the painters who worked on your job: {review-button}',
      },
      {
        position: 5,
        delay_type: 'after',
        delay_value: 3,
        delay_unit: 'days',
        channel: 'email',
        email_subject: "We'd Love Your Feedback",
        email_body:
          "Your feedback helps us improve. Would you share a quick review? If we earned 5 stars, please add it here: {review-button}",
      },
      {
        position: 6,
        delay_type: 'after',
        delay_value: 4,
        delay_unit: 'days',
        channel: 'both',
        email_subject: 'One Last Ask',
        email_body:
          'Hi {first-name}, this is my last note asking for a review. If we earned 5 stars, please leave it here: {review-button}. Each 5-star review also tips the painters who worked on your project.',
        sms_body:
          'Hi {first-name}, this is my last note asking for a review. If we earned 5 stars, please leave it here: {review-button}. Each 5-star review also tips the painters who worked on your project.',
      },
    ],
  },
];

/**
 * Seed default drip sequences for a company atomically.
 * If any sequence or step fails, all are rolled back.
 */
export const seedDefaultDripsForCompany = async (companyId: string) => {
  if (!companyId) {
    throw new Error('companyId is required to seed default drips');
  }

  // Use atomic RPC function to seed all sequences and steps in a single transaction
  const result = await RpcRepository.seedDripSequencesForCompany({
    companyId,
    sequences: DEFAULT_DRIP_SEQUENCES,
  });

  return result;
};
