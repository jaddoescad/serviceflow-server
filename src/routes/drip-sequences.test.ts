import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import express, { Express, NextFunction, Request, Response } from 'express';
import request from 'supertest';

// Mock the authorization middleware before importing the router
vi.mock('../middleware/authorization', () => ({
  requireCompanyAccess: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  requireResourceAccess: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// Mock the repositories
vi.mock('../repositories/drip-sequence-repository', () => ({
  getDripSequences: vi.fn(),
  createDripSequence: vi.fn(),
  updateDripSequence: vi.fn(),
  batchUpdateDripStepPositions: vi.fn(),
}));

// Mock the service
vi.mock('../services/drip-sequence-service', () => ({
  fetchSequenceWithSteps: vi.fn(),
}));

import dripSequencesRouter from './drip-sequences';
import * as DripSequenceRepository from '../repositories/drip-sequence-repository';
import { fetchSequenceWithSteps } from '../services/drip-sequence-service';

describe('Drip Sequences Routes', () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/drip-sequences', dripSequencesRouter);

    // Add error handler
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({ error: err.message });
    });
  });

  describe('GET /drip-sequences', () => {
    it('should return drip sequences without filters', async () => {
      const mockSequences = [
        {
          id: 'seq-1',
          company_id: 'company-1',
          pipeline_id: 'sales',
          stage_id: 'cold_leads',
          name: 'Test Sequence',
          is_enabled: true,
          steps: [],
        },
      ];

      (DripSequenceRepository.getDripSequences as Mock).mockResolvedValue(mockSequences);

      const response = await request(app).get('/drip-sequences');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSequences);
      expect(DripSequenceRepository.getDripSequences).toHaveBeenCalledWith({
        company_id: undefined,
        pipeline_id: undefined,
      });
    });

    it('should filter by company_id', async () => {
      (DripSequenceRepository.getDripSequences as Mock).mockResolvedValue([]);

      await request(app).get('/drip-sequences?company_id=company-123');

      expect(DripSequenceRepository.getDripSequences).toHaveBeenCalledWith({
        company_id: 'company-123',
        pipeline_id: undefined,
      });
    });

    it('should filter by pipeline_id', async () => {
      (DripSequenceRepository.getDripSequences as Mock).mockResolvedValue([]);

      await request(app).get('/drip-sequences?pipeline_id=sales');

      expect(DripSequenceRepository.getDripSequences).toHaveBeenCalledWith({
        company_id: undefined,
        pipeline_id: 'sales',
      });
    });

    it('should filter by both company_id and pipeline_id', async () => {
      (DripSequenceRepository.getDripSequences as Mock).mockResolvedValue([]);

      await request(app).get('/drip-sequences?company_id=company-123&pipeline_id=jobs');

      expect(DripSequenceRepository.getDripSequences).toHaveBeenCalledWith({
        company_id: 'company-123',
        pipeline_id: 'jobs',
      });
    });

    it('should handle repository errors', async () => {
      const error = new Error('Database error');
      (error as any).statusCode = 500;
      (DripSequenceRepository.getDripSequences as Mock).mockRejectedValue(error);

      const response = await request(app).get('/drip-sequences');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /drip-sequences', () => {
    it('should create a new drip sequence', async () => {
      const newSequence = {
        company_id: 'company-1',
        pipeline_id: 'sales',
        stage_id: 'cold_leads',
        name: 'New Sequence',
        is_enabled: true,
      };

      const createdSequence = {
        ...newSequence,
        id: 'new-seq-id',
        steps: [],
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      (DripSequenceRepository.createDripSequence as Mock).mockResolvedValue({ id: 'new-seq-id' });
      (fetchSequenceWithSteps as Mock).mockResolvedValue(createdSequence);

      const response = await request(app)
        .post('/drip-sequences')
        .send(newSequence);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(createdSequence);
      expect(DripSequenceRepository.createDripSequence).toHaveBeenCalledWith({
        company_id: 'company-1',
        pipeline_id: 'sales',
        stage_id: 'cold_leads',
        name: 'New Sequence',
        is_enabled: true,
      });
    });

    it('should return 400 when company_id is missing', async () => {
      const response = await request(app)
        .post('/drip-sequences')
        .send({
          pipeline_id: 'sales',
          stage_id: 'cold_leads',
          name: 'New Sequence',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should return 400 when pipeline_id is missing', async () => {
      const response = await request(app)
        .post('/drip-sequences')
        .send({
          company_id: 'company-1',
          stage_id: 'cold_leads',
          name: 'New Sequence',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should return 400 when stage_id is missing', async () => {
      const response = await request(app)
        .post('/drip-sequences')
        .send({
          company_id: 'company-1',
          pipeline_id: 'sales',
          name: 'New Sequence',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should return 400 when name is missing', async () => {
      const response = await request(app)
        .post('/drip-sequences')
        .send({
          company_id: 'company-1',
          pipeline_id: 'sales',
          stage_id: 'cold_leads',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should handle repository errors during creation', async () => {
      const error = new Error('Creation failed');
      (error as any).statusCode = 500;
      (DripSequenceRepository.createDripSequence as Mock).mockRejectedValue(error);

      const response = await request(app)
        .post('/drip-sequences')
        .send({
          company_id: 'company-1',
          pipeline_id: 'sales',
          stage_id: 'cold_leads',
          name: 'New Sequence',
          is_enabled: true,
        });

      expect(response.status).toBe(500);
    });
  });

  describe('PATCH /drip-sequences/:id', () => {
    it('should update a drip sequence', async () => {
      const updatedSequence = {
        id: 'seq-1',
        company_id: 'company-1',
        pipeline_id: 'sales',
        stage_id: 'cold_leads',
        name: 'Updated Name',
        is_enabled: false,
        steps: [],
      };

      (DripSequenceRepository.updateDripSequence as Mock).mockResolvedValue(undefined);
      (fetchSequenceWithSteps as Mock).mockResolvedValue(updatedSequence);

      const response = await request(app)
        .patch('/drip-sequences/seq-1')
        .send({ name: 'Updated Name', is_enabled: false });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedSequence);
      expect(DripSequenceRepository.updateDripSequence).toHaveBeenCalledWith('seq-1', {
        name: 'Updated Name',
        is_enabled: false,
      });
    });

    it('should only update provided fields', async () => {
      (DripSequenceRepository.updateDripSequence as Mock).mockResolvedValue(undefined);
      (fetchSequenceWithSteps as Mock).mockResolvedValue({ id: 'seq-1' });

      await request(app)
        .patch('/drip-sequences/seq-1')
        .send({ name: 'Only Name' });

      expect(DripSequenceRepository.updateDripSequence).toHaveBeenCalledWith('seq-1', {
        name: 'Only Name',
      });
    });

    it('should update is_enabled independently', async () => {
      (DripSequenceRepository.updateDripSequence as Mock).mockResolvedValue(undefined);
      (fetchSequenceWithSteps as Mock).mockResolvedValue({ id: 'seq-1' });

      await request(app)
        .patch('/drip-sequences/seq-1')
        .send({ is_enabled: true });

      expect(DripSequenceRepository.updateDripSequence).toHaveBeenCalledWith('seq-1', {
        is_enabled: true,
      });
    });

    it('should handle update errors', async () => {
      const error = new Error('Update failed');
      (error as any).statusCode = 500;
      (DripSequenceRepository.updateDripSequence as Mock).mockRejectedValue(error);

      const response = await request(app)
        .patch('/drip-sequences/seq-1')
        .send({ name: 'Test' });

      expect(response.status).toBe(500);
    });
  });

  describe('POST /drip-sequences/:id/reorder', () => {
    it('should reorder drip steps', async () => {
      const order = [
        { id: 'step-1', position: 2 },
        { id: 'step-2', position: 1 },
        { id: 'step-3', position: 3 },
      ];

      const updatedSequence = {
        id: 'seq-1',
        steps: [
          { id: 'step-2', position: 1 },
          { id: 'step-1', position: 2 },
          { id: 'step-3', position: 3 },
        ],
      };

      (DripSequenceRepository.batchUpdateDripStepPositions as Mock).mockResolvedValue(undefined);
      (fetchSequenceWithSteps as Mock).mockResolvedValue(updatedSequence);

      const response = await request(app)
        .post('/drip-sequences/seq-1/reorder')
        .send({ order });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedSequence);
      expect(DripSequenceRepository.batchUpdateDripStepPositions).toHaveBeenCalledWith(order);
    });

    it('should return 400 when order is not an array', async () => {
      const response = await request(app)
        .post('/drip-sequences/seq-1/reorder')
        .send({ order: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing order array');
    });

    it('should return 400 when order is missing', async () => {
      const response = await request(app)
        .post('/drip-sequences/seq-1/reorder')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing order array');
    });

    it('should handle reorder errors', async () => {
      const error = new Error('Reorder failed');
      (error as any).statusCode = 500;
      (DripSequenceRepository.batchUpdateDripStepPositions as Mock).mockRejectedValue(error);

      const response = await request(app)
        .post('/drip-sequences/seq-1/reorder')
        .send({ order: [{ id: 'step-1', position: 1 }] });

      expect(response.status).toBe(500);
    });
  });
});
