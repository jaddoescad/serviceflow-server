import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { fetchSequenceWithSteps, DEFAULT_DRIP_SEQUENCES, seedDefaultDripsForCompany } from './drip-sequence-service';

// Mock the repositories
vi.mock('../repositories/drip-sequence-repository', () => ({
  getDripSequenceById: vi.fn(),
}));

vi.mock('../repositories/rpc-repository', () => ({
  seedDripSequencesForCompany: vi.fn(),
}));

import * as DripSequenceRepository from '../repositories/drip-sequence-repository';
import * as RpcRepository from '../repositories/rpc-repository';

describe('Drip Sequence Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchSequenceWithSteps', () => {
    it('should return a sequence when found', async () => {
      const mockSequence = {
        id: 'seq-1',
        company_id: 'company-1',
        pipeline_id: 'sales',
        stage_id: 'cold_leads',
        name: 'Test Sequence',
        is_enabled: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        steps: [
          {
            id: 'step-1',
            sequence_id: 'seq-1',
            position: 1,
            delay_type: 'immediate',
            delay_value: 0,
            delay_unit: 'minutes',
            channel: 'email',
            email_subject: 'Subject',
            email_body: 'Body',
            sms_body: null,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        ],
      };

      (DripSequenceRepository.getDripSequenceById as Mock).mockResolvedValue(mockSequence);

      const result = await fetchSequenceWithSteps('seq-1');

      expect(DripSequenceRepository.getDripSequenceById).toHaveBeenCalledWith('seq-1');
      expect(result).toEqual(mockSequence);
    });

    it('should throw an error when sequence not found', async () => {
      (DripSequenceRepository.getDripSequenceById as Mock).mockResolvedValue(null);

      await expect(fetchSequenceWithSteps('non-existent')).rejects.toThrow('Drip sequence not found');
    });

    it('should propagate repository errors', async () => {
      (DripSequenceRepository.getDripSequenceById as Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      await expect(fetchSequenceWithSteps('seq-1')).rejects.toThrow('Database connection failed');
    });
  });

  describe('DEFAULT_DRIP_SEQUENCES', () => {
    it('should have all required sales pipeline stages with drips', () => {
      const salesStages = DEFAULT_DRIP_SEQUENCES
        .filter((seq) => seq.pipeline_id === 'sales')
        .map((seq) => seq.stage_id);

      expect(salesStages).toContain('cold_leads');
      expect(salesStages).toContain('in_draft');
      expect(salesStages).toContain('proposals_sent');
      expect(salesStages).toContain('proposals_rejected');
      // Note: estimate_scheduled does not have drips
      expect(salesStages).not.toContain('estimate_scheduled');
    });

    it('should have all required jobs pipeline stages', () => {
      const jobsStages = DEFAULT_DRIP_SEQUENCES
        .filter((seq) => seq.pipeline_id === 'jobs')
        .map((seq) => seq.stage_id);

      expect(jobsStages).toContain('project_accepted');
      expect(jobsStages).toContain('project_scheduled');
      expect(jobsStages).toContain('project_in_progress');
      expect(jobsStages).toContain('project_complete');
    });

    it('should have valid delay types for all steps', () => {
      const validDelayTypes = ['immediate', 'after'];

      DEFAULT_DRIP_SEQUENCES.forEach((sequence) => {
        sequence.steps.forEach((step) => {
          expect(validDelayTypes).toContain(step.delay_type);
        });
      });
    });

    it('should have valid delay units for all steps', () => {
      const validDelayUnits = ['minutes', 'hours', 'days', 'weeks', 'months'];

      DEFAULT_DRIP_SEQUENCES.forEach((sequence) => {
        sequence.steps.forEach((step) => {
          expect(validDelayUnits).toContain(step.delay_unit);
        });
      });
    });

    it('should have valid channels for all steps', () => {
      const validChannels = ['email', 'sms', 'both'];

      DEFAULT_DRIP_SEQUENCES.forEach((sequence) => {
        sequence.steps.forEach((step) => {
          expect(validChannels).toContain(step.channel);
        });
      });
    });

    it('should have email_subject and email_body for email and both channels', () => {
      DEFAULT_DRIP_SEQUENCES.forEach((sequence) => {
        sequence.steps.forEach((step) => {
          if (step.channel === 'email' || step.channel === 'both') {
            expect(step.email_subject).toBeTruthy();
            expect(step.email_body).toBeTruthy();
          }
        });
      });
    });

    it('should have sms_body for sms and both channels', () => {
      DEFAULT_DRIP_SEQUENCES.forEach((sequence) => {
        sequence.steps.forEach((step) => {
          if (step.channel === 'sms' || step.channel === 'both') {
            expect(step.sms_body).toBeTruthy();
          }
        });
      });
    });

    it('should have positions starting from 1 and incrementing', () => {
      DEFAULT_DRIP_SEQUENCES.forEach((sequence) => {
        const positions = sequence.steps.map((step) => step.position);
        positions.forEach((pos, index) => {
          expect(pos).toBe(index + 1);
        });
      });
    });

    it('should have immediate delay_value of 0 for immediate delay type', () => {
      DEFAULT_DRIP_SEQUENCES.forEach((sequence) => {
        sequence.steps.forEach((step) => {
          if (step.delay_type === 'immediate') {
            expect(step.delay_value).toBe(0);
          }
        });
      });
    });

    it('should have positive delay_value for after delay type', () => {
      DEFAULT_DRIP_SEQUENCES.forEach((sequence) => {
        sequence.steps.forEach((step) => {
          if (step.delay_type === 'after') {
            expect(step.delay_value).toBeGreaterThan(0);
          }
        });
      });
    });

    it('should have unique stage_id per pipeline_id', () => {
      const salesStages = DEFAULT_DRIP_SEQUENCES
        .filter((seq) => seq.pipeline_id === 'sales')
        .map((seq) => seq.stage_id);
      const jobsStages = DEFAULT_DRIP_SEQUENCES
        .filter((seq) => seq.pipeline_id === 'jobs')
        .map((seq) => seq.stage_id);

      expect(new Set(salesStages).size).toBe(salesStages.length);
      expect(new Set(jobsStages).size).toBe(jobsStages.length);
    });

    it('should have all sequences enabled by default', () => {
      DEFAULT_DRIP_SEQUENCES.forEach((sequence) => {
        expect(sequence.is_enabled).toBe(true);
      });
    });

    it('should contain template placeholders in messages', () => {
      const hasPlaceholders = DEFAULT_DRIP_SEQUENCES.some((sequence) =>
        sequence.steps.some(
          (step) =>
            (step.email_body && step.email_body.includes('{')) ||
            (step.sms_body && step.sms_body.includes('{'))
        )
      );
      expect(hasPlaceholders).toBe(true);
    });

    it('should have aggressive follow up sequence with multiple steps', () => {
      const coldLeadsSequence = DEFAULT_DRIP_SEQUENCES.find(
        (seq) => seq.stage_id === 'cold_leads'
      );
      expect(coldLeadsSequence).toBeDefined();
      expect(coldLeadsSequence!.steps.length).toBeGreaterThanOrEqual(5);
    });

    it('should have review request sequence for project_complete', () => {
      const reviewSequence = DEFAULT_DRIP_SEQUENCES.find(
        (seq) => seq.stage_id === 'project_complete'
      );
      expect(reviewSequence).toBeDefined();
      expect(reviewSequence!.name).toContain('Review');
    });
  });

  describe('seedDefaultDripsForCompany', () => {
    it('should seed default drips for a company', async () => {
      const mockResult = { sequenceCount: 8, stepCount: 29 };
      (RpcRepository.seedDripSequencesForCompany as Mock).mockResolvedValue(mockResult);

      const result = await seedDefaultDripsForCompany('company-123');

      expect(RpcRepository.seedDripSequencesForCompany).toHaveBeenCalledWith({
        companyId: 'company-123',
        sequences: DEFAULT_DRIP_SEQUENCES,
      });
      expect(result).toEqual(mockResult);
    });

    it('should throw error when companyId is missing', async () => {
      await expect(seedDefaultDripsForCompany('')).rejects.toThrow(
        'companyId is required to seed default drips'
      );
    });

    it('should propagate RPC errors', async () => {
      (RpcRepository.seedDripSequencesForCompany as Mock).mockRejectedValue(
        new Error('RPC call failed')
      );

      await expect(seedDefaultDripsForCompany('company-123')).rejects.toThrow('RPC call failed');
    });
  });
});
