import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { ValidationError, NotFoundError } from '../lib/errors';
import { getPipelineStages } from '../config/pipelines';
import * as AppointmentRepository from '../repositories/appointment-repository';
import { requireCompanyAccess, requireResourceAccess } from '../middleware/authorization';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sanitizeUserId = (value: unknown): string | null => {
  if (typeof value === 'string' && UUID_REGEX.test(value)) {
    return value;
  }
  return null;
};

const parseDateParam = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }

  return parsed.toISOString();
};

const router = Router();

// Get appointments - requires company membership
router.get(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const { company_id, deal_id, start, end, scope } = req.query;

    const startIso = parseDateParam(start);
    if (start && !startIso) {
      throw new ValidationError('Invalid start datetime');
    }

    const endIso = parseDateParam(end);
    if (end && !endIso) {
      throw new ValidationError('Invalid end datetime');
    }

    // Determine pipeline stages based on scope
    let dealStages: string[] | undefined;
    const scopeValue = typeof scope === 'string' ? scope : undefined;
    if (scopeValue === 'appointments') {
      dealStages = getPipelineStages('sales') ?? undefined;
    } else if (scopeValue === 'jobs') {
      dealStages = getPipelineStages('jobs') ?? undefined;
    }

    const appointments = await AppointmentRepository.getCalendarAppointments({
      company_id: typeof company_id === 'string' ? company_id.trim() : undefined,
      deal_id: typeof deal_id === 'string' ? deal_id.trim() : undefined,
      start_date: startIso ?? undefined,
      end_date: endIso ?? undefined,
      deal_stages: dealStages,
    });

    res.json(appointments);
  })
);

// Create appointment - requires company membership
router.post(
  '/',
  requireCompanyAccess(),
  asyncHandler(async (req, res) => {
    const payload = {
      ...req.body,
      assigned_to: sanitizeUserId(req.body?.assigned_to),
    };

    if (!payload.company_id || !payload.deal_id || !payload.scheduled_start || !payload.scheduled_end) {
      throw new ValidationError('Missing required appointment fields');
    }

    const appointment = await AppointmentRepository.createAppointment(payload);
    res.json(appointment);
  })
);

// Get appointment by ID - requires access to appointment's company
router.get(
  '/:id',
  requireResourceAccess({ resourceType: 'appointment' }),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const appointment = await AppointmentRepository.getAppointmentById(id);

    if (!appointment) {
      throw new NotFoundError('Appointment not found');
    }

    res.json(appointment);
  })
);

export default router;
