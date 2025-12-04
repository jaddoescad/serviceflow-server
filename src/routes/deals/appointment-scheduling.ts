import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler';
import { ValidationError, NotFoundError } from '../../lib/errors';
import { deleteGoogleEventByICalUID, refreshGoogleAccessToken } from '../../lib/google-calendar';
import { sanitizeUserId } from '../../utils/validation';
import * as DealRepository from '../../repositories/deal-repository';
import * as AppointmentRepository from '../../repositories/appointment-repository';
import * as GoogleCalendarTokenRepository from '../../repositories/google-calendar-token-repository';
import * as DripRepository from '../../repositories/drip-sequence-repository';
import { deliverAppointmentCommunications } from '../../services/appointment-service';
import { requireResourceAccess } from '../../middleware/authorization';

const router = Router();

// POST /:dealId/schedule - Schedule a new appointment for a deal
router.post(
  '/:dealId/schedule',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId } = req.params;
    const { stage, appointment, deal, communications, sendReminder, reminderChannel } = req.body ?? {};

    if (!stage || typeof stage !== 'string') {
      throw new ValidationError('stage is required');
    }

    if (!['estimate_scheduled', 'project_scheduled'].includes(stage)) {
      throw new ValidationError('Invalid stage provided');
    }

    if (!appointment || typeof appointment !== 'object') {
      throw new ValidationError('appointment payload is required');
    }

    if (!appointment.scheduled_start || !appointment.scheduled_end) {
      throw new ValidationError('scheduled_start and scheduled_end are required for appointments');
    }

    const emailTo = communications?.email?.to?.trim();
    const emailSubject = communications?.email?.subject?.trim();
    const emailBody = communications?.email?.body?.trim();
    const smsTo = communications?.sms?.to?.trim();
    const smsBody = communications?.sms?.body?.trim();

    if (appointment.send_email && (!emailTo || !emailSubject || !emailBody)) {
      throw new ValidationError('Email confirmation requires recipient, subject, and body.');
    }

    if (appointment.send_sms && (!smsTo || !smsBody)) {
      throw new ValidationError('SMS confirmation requires recipient and message body.');
    }

    if (!deal || typeof deal !== 'object') {
      throw new ValidationError('deal payload is required');
    }

    const existingDeal = await DealRepository.getDealById(dealId);

    if (!existingDeal) {
      throw new NotFoundError('Deal not found');
    }

    const appointmentPayload = {
      ...appointment,
      assigned_to: sanitizeUserId(appointment.assigned_to),
      company_id: appointment.company_id ?? existingDeal.company_id,
      deal_id: dealId,
    };

    if (!appointmentPayload.company_id) {
      throw new ValidationError('company_id is required for appointments');
    }

    const createdAppointment = await AppointmentRepository.createAppointment(appointmentPayload);

    let updatedDeal;
    try {
      await DealRepository.updateDeal(dealId, {
        ...deal,
        assigned_to: sanitizeUserId(deal.assigned_to),
        stage,
        updated_at: new Date().toISOString(),
      });

      updatedDeal = await DealRepository.getDealById(dealId);
    } catch (updateError) {
      // Best-effort rollback of the appointment if the deal update fails
      try {
        await AppointmentRepository.deleteAppointment(createdAppointment.id);
      } catch (rollbackError) {
        console.error('Failed to rollback appointment creation', rollbackError);
      }
      throw updateError;
    }

    if (!updatedDeal) {
      throw new NotFoundError('Failed to retrieve updated deal');
    }

    const communicationResults = await deliverAppointmentCommunications({
      companyId: updatedDeal.company_id ?? appointmentPayload.company_id,
      communications,
      sendEmail: Boolean(appointmentPayload.send_email),
      sendSms: Boolean(appointmentPayload.send_sms),
    });

    // Schedule reminder if requested
    if (sendReminder && reminderChannel && reminderChannel !== 'none') {
      try {
        const appointmentStart = new Date(appointment.scheduled_start);
        const reminderTime = new Date(appointmentStart.getTime() - 24 * 60 * 60 * 1000); // 24 hours before

        // Only schedule if reminder time is in the future
        if (reminderTime > new Date()) {
          await DripRepository.createAppointmentReminder({
            companyId: updatedDeal.company_id ?? appointmentPayload.company_id,
            dealId,
            appointmentId: createdAppointment.id,
            channel: reminderChannel,
            sendAt: reminderTime,
            // Template content will be populated by the job processor using communication_templates
          });
        }
      } catch (reminderError) {
        console.error('Failed to schedule appointment reminder', reminderError);
        // Don't fail the request if reminder scheduling fails
      }
    }

    res.json({
      ...updatedDeal,
      latest_appointment: createdAppointment,
      communication_results: communicationResults,
    });
  })
);

// PATCH /:dealId/appointments/:appointmentId - Update an existing appointment
router.patch(
  '/:dealId/appointments/:appointmentId',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId, appointmentId } = req.params;
    const { appointment, deal, communications, sendReminder, reminderChannel } = req.body ?? {};

    if (!appointment || typeof appointment !== 'object') {
      throw new ValidationError('appointment payload is required');
    }

    if (!deal || typeof deal !== 'object') {
      throw new ValidationError('deal payload is required');
    }

    const emailTo = communications?.email?.to?.trim();
    const emailSubject = communications?.email?.subject?.trim();
    const emailBody = communications?.email?.body?.trim();
    const smsTo = communications?.sms?.to?.trim();
    const smsBody = communications?.sms?.body?.trim();

    if (appointment.send_email && (!emailTo || !emailSubject || !emailBody)) {
      throw new ValidationError('Email confirmation requires recipient, subject, and body.');
    }

    if (appointment.send_sms && (!smsTo || !smsBody)) {
      throw new ValidationError('SMS confirmation requires recipient and message body.');
    }

    const existingDeal = await DealRepository.getDealById(dealId);

    if (!existingDeal) {
      throw new NotFoundError('Deal not found');
    }

    const updatedAppointment = await AppointmentRepository.updateAppointment(appointmentId, {
      ...appointment,
      assigned_to: sanitizeUserId(appointment.assigned_to),
      company_id: appointment.company_id ?? existingDeal.company_id,
      deal_id: dealId,
      updated_at: new Date().toISOString(),
    });

    if (!updatedAppointment) {
      throw new NotFoundError('Failed to update appointment');
    }

    await DealRepository.updateDeal(dealId, {
      ...deal,
      assigned_to: sanitizeUserId(deal.assigned_to),
      updated_at: new Date().toISOString(),
    });

    const updatedDeal = await DealRepository.getDealById(dealId);

    if (!updatedDeal) {
      throw new NotFoundError('Failed to update deal');
    }

    const communicationResults = await deliverAppointmentCommunications({
      companyId: updatedDeal.company_id ?? appointment.company_id ?? existingDeal.company_id,
      communications,
      sendEmail: Boolean(appointment.send_email),
      sendSms: Boolean(appointment.send_sms),
    });

    // Cancel existing reminders and reschedule if needed
    try {
      await DripRepository.cancelAppointmentReminders(appointmentId, 'Appointment updated');

      if (sendReminder && reminderChannel && reminderChannel !== 'none') {
        const appointmentStart = new Date(appointment.scheduled_start);
        const reminderTime = new Date(appointmentStart.getTime() - 24 * 60 * 60 * 1000); // 24 hours before

        // Only schedule if reminder time is in the future
        if (reminderTime > new Date()) {
          await DripRepository.createAppointmentReminder({
            companyId: updatedDeal.company_id ?? appointment.company_id ?? existingDeal.company_id,
            dealId,
            appointmentId,
            channel: reminderChannel,
            sendAt: reminderTime,
          });
        }
      }
    } catch (reminderError) {
      console.error('Failed to update appointment reminders', reminderError);
      // Don't fail the request if reminder scheduling fails
    }

    res.json({
      ...updatedDeal,
      latest_appointment: updatedAppointment,
      communication_results: communicationResults,
    });
  })
);

// GET /:dealId/appointments/:appointmentId/reminder - Check if appointment has a pending reminder
router.get(
  '/:dealId/appointments/:appointmentId/reminder',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { appointmentId } = req.params;

    const hasReminder = await DripRepository.hasPendingReminder(appointmentId);

    res.json({ hasReminder });
  })
);

// DELETE /:dealId/appointments/:appointmentId - Delete an appointment
router.delete(
  '/:dealId/appointments/:appointmentId',
  requireResourceAccess({ resourceType: 'deal', resourceIdParam: 'dealId' }),
  asyncHandler(async (req, res) => {
    const { dealId, appointmentId } = req.params;
    const userId = req.user?.id;

    await AppointmentRepository.deleteAppointment(appointmentId);

    // Best-effort Google Calendar deletion if user context is provided
    if (userId) {
      try {
        const tokenRow = await GoogleCalendarTokenRepository.getTokenByUserId(userId);

        if (tokenRow?.refresh_token) {
          let accessToken: string | null = tokenRow.access_token;
          let refreshToken: string = tokenRow.refresh_token;
          let expiresAt: number | null = tokenRow.access_token_expires_at
            ? Date.parse(tokenRow.access_token_expires_at)
            : null;

          const shouldRefresh = !accessToken || (expiresAt && expiresAt < Date.now() + 60_000);

          if (shouldRefresh) {
            const refreshed = await refreshGoogleAccessToken(refreshToken);
            if (refreshed?.accessToken) {
              accessToken = refreshed.accessToken;
              refreshToken = refreshed.refreshToken ?? refreshToken;
              expiresAt = refreshed.expiresAt ?? null;

              await GoogleCalendarTokenRepository.upsertToken({
                user_id: userId,
                refresh_token: refreshToken,
                access_token: accessToken,
                access_token_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
                scope: refreshed.scope ?? tokenRow.scope ?? null,
                token_type: refreshed.tokenType ?? tokenRow.token_type ?? null,
              });
            }
          }

          if (accessToken) {
            const icalUid = `sf-${appointmentId}@serviceflow`;
            await deleteGoogleEventByICalUID({ accessToken }, 'primary', icalUid);
          }
        }
      } catch (cleanupError) {
        console.error('Failed to delete Google Calendar event for appointment', cleanupError);
      }
    }

    res.json({ success: true });
  })
);

export default router;
