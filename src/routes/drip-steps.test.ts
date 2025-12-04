import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import express, { Express, NextFunction, Request, Response } from 'express';
import request from 'supertest';

// Mock the authorization middleware before importing the router
vi.mock('../middleware/authorization', () => ({
  requireResourceAccess: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// Mock the repositories
vi.mock('../repositories/drip-sequence-repository', () => ({
  createDripStep: vi.fn(),
  updateDripStep: vi.fn(),
  getDripStepById: vi.fn(),
  deleteDripStep: vi.fn(),
}));

// Mock the service
vi.mock('../services/drip-sequence-service', () => ({
  fetchSequenceWithSteps: vi.fn(),
}));

import dripStepsRouter from './drip-steps';
import * as DripSequenceRepository from '../repositories/drip-sequence-repository';
import { fetchSequenceWithSteps } from '../services/drip-sequence-service';

describe('Drip Steps Routes', () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/drip-steps', dripStepsRouter);

    // Add error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({ error: err.message });
    });
  });

  describe('POST /drip-steps', () => {
    it('should create a new drip step', async () => {
      const newStep = {
        sequence_id: 'seq-1',
        position: 1,
        delay_type: 'immediate',
        delay_value: 0,
        delay_unit: 'minutes',
        channel: 'email',
        email_subject: 'Test Subject',
        email_body: 'Test Body',
        sms_body: null,
      };

      const sequenceWithStep = {
        id: 'seq-1',
        steps: [
          {
            id: 'step-1',
            ...newStep,
          },
        ],
      };

      (DripSequenceRepository.createDripStep as Mock).mockResolvedValue({ sequence_id: 'seq-1' });
      (fetchSequenceWithSteps as Mock).mockResolvedValue(sequenceWithStep);

      const response = await request(app)
        .post('/drip-steps')
        .send(newStep);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(sequenceWithStep);
      expect(DripSequenceRepository.createDripStep).toHaveBeenCalledWith({
        sequence_id: 'seq-1',
        position: 1,
        delay_type: 'immediate',
        delay_value: 0,
        delay_unit: 'minutes',
        channel: 'email',
        email_subject: 'Test Subject',
        email_body: 'Test Body',
        sms_body: null,
      });
    });

    it('should create a step with SMS only', async () => {
      const newStep = {
        sequence_id: 'seq-1',
        position: 2,
        delay_type: 'after',
        delay_value: 2,
        delay_unit: 'hours',
        channel: 'sms',
        email_subject: null,
        email_body: null,
        sms_body: 'Test SMS',
      };

      (DripSequenceRepository.createDripStep as Mock).mockResolvedValue({ sequence_id: 'seq-1' });
      (fetchSequenceWithSteps as Mock).mockResolvedValue({ id: 'seq-1', steps: [] });

      const response = await request(app)
        .post('/drip-steps')
        .send(newStep);

      expect(response.status).toBe(200);
      expect(DripSequenceRepository.createDripStep).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'sms',
          sms_body: 'Test SMS',
        })
      );
    });

    it('should create a step with both email and SMS', async () => {
      const newStep = {
        sequence_id: 'seq-1',
        position: 1,
        delay_type: 'immediate',
        delay_value: 0,
        delay_unit: 'minutes',
        channel: 'both',
        email_subject: 'Test Subject',
        email_body: 'Test Body',
        sms_body: 'Test SMS',
      };

      (DripSequenceRepository.createDripStep as Mock).mockResolvedValue({ sequence_id: 'seq-1' });
      (fetchSequenceWithSteps as Mock).mockResolvedValue({ id: 'seq-1', steps: [] });

      const response = await request(app)
        .post('/drip-steps')
        .send(newStep);

      expect(response.status).toBe(200);
      expect(DripSequenceRepository.createDripStep).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'both',
          email_subject: 'Test Subject',
          sms_body: 'Test SMS',
        })
      );
    });

    it('should return 400 when sequence_id is missing', async () => {
      const response = await request(app)
        .post('/drip-steps')
        .send({
          position: 1,
          delay_type: 'immediate',
          delay_value: 0,
          delay_unit: 'minutes',
          channel: 'email',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should return 400 when position is missing', async () => {
      const response = await request(app)
        .post('/drip-steps')
        .send({
          sequence_id: 'seq-1',
          delay_type: 'immediate',
          delay_value: 0,
          delay_unit: 'minutes',
          channel: 'email',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should return 400 when delay_type is missing', async () => {
      const response = await request(app)
        .post('/drip-steps')
        .send({
          sequence_id: 'seq-1',
          position: 1,
          delay_value: 0,
          delay_unit: 'minutes',
          channel: 'email',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should return 400 when delay_value is missing', async () => {
      const response = await request(app)
        .post('/drip-steps')
        .send({
          sequence_id: 'seq-1',
          position: 1,
          delay_type: 'immediate',
          delay_unit: 'minutes',
          channel: 'email',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should return 400 when delay_unit is missing', async () => {
      const response = await request(app)
        .post('/drip-steps')
        .send({
          sequence_id: 'seq-1',
          position: 1,
          delay_type: 'immediate',
          delay_value: 0,
          channel: 'email',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should return 400 when channel is missing', async () => {
      const response = await request(app)
        .post('/drip-steps')
        .send({
          sequence_id: 'seq-1',
          position: 1,
          delay_type: 'immediate',
          delay_value: 0,
          delay_unit: 'minutes',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should handle repository errors during creation', async () => {
      const error = new Error('Creation failed');
      (error as any).statusCode = 500;
      (DripSequenceRepository.createDripStep as Mock).mockRejectedValue(error);

      const response = await request(app)
        .post('/drip-steps')
        .send({
          sequence_id: 'seq-1',
          position: 1,
          delay_type: 'immediate',
          delay_value: 0,
          delay_unit: 'minutes',
          channel: 'email',
        });

      expect(response.status).toBe(500);
    });

    it('should default email_subject to null when not provided', async () => {
      (DripSequenceRepository.createDripStep as Mock).mockResolvedValue({ sequence_id: 'seq-1' });
      (fetchSequenceWithSteps as Mock).mockResolvedValue({ id: 'seq-1', steps: [] });

      await request(app)
        .post('/drip-steps')
        .send({
          sequence_id: 'seq-1',
          position: 1,
          delay_type: 'immediate',
          delay_value: 0,
          delay_unit: 'minutes',
          channel: 'sms',
          sms_body: 'SMS only',
        });

      expect(DripSequenceRepository.createDripStep).toHaveBeenCalledWith(
        expect.objectContaining({
          email_subject: null,
          email_body: null,
        })
      );
    });
  });

  describe('PATCH /drip-steps/:id', () => {
    it('should update a drip step', async () => {
      const updates = {
        delay_type: 'after',
        delay_value: 5,
        delay_unit: 'days',
        channel: 'sms',
        sms_body: 'Updated SMS',
      };

      const updatedSequence = {
        id: 'seq-1',
        steps: [
          {
            id: 'step-1',
            ...updates,
          },
        ],
      };

      (DripSequenceRepository.updateDripStep as Mock).mockResolvedValue({ sequence_id: 'seq-1' });
      (fetchSequenceWithSteps as Mock).mockResolvedValue(updatedSequence);

      const response = await request(app)
        .patch('/drip-steps/step-1')
        .send(updates);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedSequence);
      expect(DripSequenceRepository.updateDripStep).toHaveBeenCalledWith('step-1', updates);
    });

    it('should only update provided fields', async () => {
      (DripSequenceRepository.updateDripStep as Mock).mockResolvedValue({ sequence_id: 'seq-1' });
      (fetchSequenceWithSteps as Mock).mockResolvedValue({ id: 'seq-1', steps: [] });

      await request(app)
        .patch('/drip-steps/step-1')
        .send({ channel: 'email' });

      expect(DripSequenceRepository.updateDripStep).toHaveBeenCalledWith('step-1', {
        channel: 'email',
      });
    });

    it('should update delay values independently', async () => {
      (DripSequenceRepository.updateDripStep as Mock).mockResolvedValue({ sequence_id: 'seq-1' });
      (fetchSequenceWithSteps as Mock).mockResolvedValue({ id: 'seq-1', steps: [] });

      await request(app)
        .patch('/drip-steps/step-1')
        .send({ delay_value: 10, delay_unit: 'hours' });

      expect(DripSequenceRepository.updateDripStep).toHaveBeenCalledWith('step-1', {
        delay_value: 10,
        delay_unit: 'hours',
      });
    });

    it('should return 404 when step not found', async () => {
      (DripSequenceRepository.updateDripStep as Mock).mockResolvedValue(null);

      const response = await request(app)
        .patch('/drip-steps/non-existent')
        .send({ channel: 'email' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Drip step not found');
    });

    it('should handle repository errors during update', async () => {
      const error = new Error('Update failed');
      (error as any).statusCode = 500;
      (DripSequenceRepository.updateDripStep as Mock).mockRejectedValue(error);

      const response = await request(app)
        .patch('/drip-steps/step-1')
        .send({ channel: 'email' });

      expect(response.status).toBe(500);
    });

    it('should update email fields', async () => {
      (DripSequenceRepository.updateDripStep as Mock).mockResolvedValue({ sequence_id: 'seq-1' });
      (fetchSequenceWithSteps as Mock).mockResolvedValue({ id: 'seq-1', steps: [] });

      await request(app)
        .patch('/drip-steps/step-1')
        .send({
          email_subject: 'New Subject',
          email_body: 'New Body',
        });

      expect(DripSequenceRepository.updateDripStep).toHaveBeenCalledWith('step-1', {
        email_subject: 'New Subject',
        email_body: 'New Body',
      });
    });

    it('should update sms_body', async () => {
      (DripSequenceRepository.updateDripStep as Mock).mockResolvedValue({ sequence_id: 'seq-1' });
      (fetchSequenceWithSteps as Mock).mockResolvedValue({ id: 'seq-1', steps: [] });

      await request(app)
        .patch('/drip-steps/step-1')
        .send({ sms_body: 'New SMS Body' });

      expect(DripSequenceRepository.updateDripStep).toHaveBeenCalledWith('step-1', {
        sms_body: 'New SMS Body',
      });
    });
  });

  describe('DELETE /drip-steps/:id', () => {
    it('should delete a drip step and return updated sequence', async () => {
      const existingStep = { sequence_id: 'seq-1' };
      const updatedSequence = {
        id: 'seq-1',
        steps: [],
      };

      (DripSequenceRepository.getDripStepById as Mock).mockResolvedValue(existingStep);
      (DripSequenceRepository.deleteDripStep as Mock).mockResolvedValue(undefined);
      (fetchSequenceWithSteps as Mock).mockResolvedValue(updatedSequence);

      const response = await request(app).delete('/drip-steps/step-1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedSequence);
      expect(DripSequenceRepository.getDripStepById).toHaveBeenCalledWith('step-1');
      expect(DripSequenceRepository.deleteDripStep).toHaveBeenCalledWith('step-1');
    });

    it('should return 404 when step not found', async () => {
      (DripSequenceRepository.getDripStepById as Mock).mockResolvedValue(null);

      const response = await request(app).delete('/drip-steps/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Drip step not found');
      expect(DripSequenceRepository.deleteDripStep).not.toHaveBeenCalled();
    });

    it('should return null when sequence is gone after deletion', async () => {
      const existingStep = { sequence_id: 'seq-1' };

      (DripSequenceRepository.getDripStepById as Mock).mockResolvedValue(existingStep);
      (DripSequenceRepository.deleteDripStep as Mock).mockResolvedValue(undefined);
      (fetchSequenceWithSteps as Mock).mockRejectedValue(new Error('Sequence not found'));

      const response = await request(app).delete('/drip-steps/step-1');

      expect(response.status).toBe(200);
      expect(response.body).toBeNull();
    });

    it('should handle repository errors during deletion', async () => {
      const existingStep = { sequence_id: 'seq-1' };
      const error = new Error('Delete failed');
      (error as any).statusCode = 500;

      (DripSequenceRepository.getDripStepById as Mock).mockResolvedValue(existingStep);
      (DripSequenceRepository.deleteDripStep as Mock).mockRejectedValue(error);

      const response = await request(app).delete('/drip-steps/step-1');

      expect(response.status).toBe(500);
    });

    it('should handle repository errors when fetching step', async () => {
      const error = new Error('Fetch failed');
      (error as any).statusCode = 500;
      (DripSequenceRepository.getDripStepById as Mock).mockRejectedValue(error);

      const response = await request(app).delete('/drip-steps/step-1');

      expect(response.status).toBe(500);
    });
  });
});
