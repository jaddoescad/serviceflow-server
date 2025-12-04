import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import {
  getDripSequences,
  getDripSequenceById,
  createDripSequence,
  updateDripSequence,
  deleteDripSequence,
  updateDripStepPosition,
  batchUpdateDripStepPositions,
  createDripStep,
  updateDripStep,
  getDripStepById,
  deleteDripStep,
  cancelPendingDripJobsForDeal,
  DripSequence,
  DripStep,
} from './drip-sequence-repository';
import { DatabaseError } from './quote-repository';

// Mock the supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '../lib/supabase';

describe('Drip Sequence Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create mock chain
  const createMockChain = (finalData: any, error: any = null) => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: finalData, error }),
      maybeSingle: vi.fn().mockResolvedValue({ data: finalData, error }),
    };
    // For terminal operations that return data/error directly
    chain.select.mockImplementation(() => {
      chain._terminalData = finalData;
      chain._terminalError = error;
      return chain;
    });
    // Override for cases where we need to return immediately
    return chain;
  };

  describe('getDripSequences', () => {
    it('should fetch all drip sequences without filters', async () => {
      const mockSequences: DripSequence[] = [
        {
          id: 'seq-1',
          company_id: 'company-1',
          pipeline_id: 'sales',
          stage_id: 'cold_leads',
          name: 'Test Sequence',
          is_enabled: true,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          steps: [],
        },
      ];

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
      mockChain.order.mockResolvedValue({ data: mockSequences, error: null });
      (supabase.from as Mock).mockReturnValue(mockChain);

      const result = await getDripSequences();

      expect(supabase.from).toHaveBeenCalledWith('drip_sequences');
      expect(mockChain.select).toHaveBeenCalledWith('*,steps:drip_steps(*)');
      expect(result).toEqual(mockSequences);
    });

    it('should filter by company_id when provided', async () => {
      const mockSequences: DripSequence[] = [];

      // Create a proper chain where order returns the chain, and eq can be called after
      const mockChain: any = {
        select: vi.fn(),
        order: vi.fn(),
        eq: vi.fn(),
      };
      // order returns this for chaining, but we need to handle the terminal case
      mockChain.select.mockReturnValue(mockChain);
      mockChain.order.mockReturnValue(mockChain);
      mockChain.eq.mockImplementation(() => {
        // Return a thenable that resolves with our data
        return Promise.resolve({ data: mockSequences, error: null });
      });
      (supabase.from as Mock).mockReturnValue(mockChain);

      await getDripSequences({ company_id: 'company-123' });

      expect(mockChain.eq).toHaveBeenCalledWith('company_id', 'company-123');
    });

    it('should filter by pipeline_id when provided', async () => {
      const mockSequences: DripSequence[] = [];

      // Create a proper chain where order returns the chain, and eq can be called after
      const mockChain: any = {
        select: vi.fn(),
        order: vi.fn(),
        eq: vi.fn(),
      };
      mockChain.select.mockReturnValue(mockChain);
      mockChain.order.mockReturnValue(mockChain);
      mockChain.eq.mockImplementation(() => {
        return Promise.resolve({ data: mockSequences, error: null });
      });
      (supabase.from as Mock).mockReturnValue(mockChain);

      await getDripSequences({ pipeline_id: 'sales' });

      expect(mockChain.eq).toHaveBeenCalledWith('pipeline_id', 'sales');
    });

    it('should throw DatabaseError on failure', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      };
      mockChain.order.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });
      (supabase.from as Mock).mockReturnValue(mockChain);

      await expect(getDripSequences()).rejects.toThrow(DatabaseError);
      await expect(getDripSequences()).rejects.toThrow('Failed to fetch drip sequences');
    });
  });

  describe('getDripSequenceById', () => {
    it('should fetch a single sequence with its steps', async () => {
      const mockSequence: DripSequence = {
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

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockSequence, error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      const result = await getDripSequenceById('seq-1');

      expect(supabase.from).toHaveBeenCalledWith('drip_sequences');
      expect(mockChain.eq).toHaveBeenCalledWith('id', 'seq-1');
      expect(result).toEqual(mockSequence);
    });

    it('should return null if sequence not found', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      const result = await getDripSequenceById('non-existent');

      expect(result).toBeNull();
    });

    it('should throw DatabaseError on failure', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database error' },
        }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      await expect(getDripSequenceById('seq-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('createDripSequence', () => {
    it('should create a new drip sequence', async () => {
      const newSequence = {
        company_id: 'company-1',
        pipeline_id: 'sales',
        stage_id: 'cold_leads',
        name: 'New Sequence',
        is_enabled: true,
      };

      const mockChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'new-seq-id' }, error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      const result = await createDripSequence(newSequence);

      expect(supabase.from).toHaveBeenCalledWith('drip_sequences');
      expect(mockChain.insert).toHaveBeenCalledWith([newSequence]);
      expect(mockChain.select).toHaveBeenCalledWith('id');
      expect(result).toEqual({ id: 'new-seq-id' });
    });

    it('should throw DatabaseError on creation failure', async () => {
      const mockChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Unique constraint violation' },
        }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      await expect(createDripSequence({ name: 'Test' })).rejects.toThrow(DatabaseError);
    });
  });

  describe('updateDripSequence', () => {
    it('should update a drip sequence', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      await updateDripSequence('seq-1', { name: 'Updated Name', is_enabled: false });

      expect(supabase.from).toHaveBeenCalledWith('drip_sequences');
      expect(mockChain.update).toHaveBeenCalledWith({ name: 'Updated Name', is_enabled: false });
      expect(mockChain.eq).toHaveBeenCalledWith('id', 'seq-1');
    });

    it('should throw DatabaseError on update failure', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: 'Update failed' } }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      await expect(updateDripSequence('seq-1', { name: 'Test' })).rejects.toThrow(DatabaseError);
    });
  });

  describe('deleteDripSequence', () => {
    it('should delete a drip sequence', async () => {
      const mockChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      await deleteDripSequence('seq-1');

      expect(supabase.from).toHaveBeenCalledWith('drip_sequences');
      expect(mockChain.delete).toHaveBeenCalled();
      expect(mockChain.eq).toHaveBeenCalledWith('id', 'seq-1');
    });

    it('should throw DatabaseError on deletion failure', async () => {
      const mockChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: 'Delete failed' } }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      await expect(deleteDripSequence('seq-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('updateDripStepPosition', () => {
    it('should update a step position', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      await updateDripStepPosition('step-1', 3);

      expect(supabase.from).toHaveBeenCalledWith('drip_steps');
      expect(mockChain.update).toHaveBeenCalledWith({ position: 3 });
      expect(mockChain.eq).toHaveBeenCalledWith('id', 'step-1');
    });

    it('should throw DatabaseError on failure', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: 'Update failed' } }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      await expect(updateDripStepPosition('step-1', 3)).rejects.toThrow(DatabaseError);
    });
  });

  describe('batchUpdateDripStepPositions', () => {
    it('should batch update multiple step positions', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      const updates = [
        { id: 'step-1', position: 1 },
        { id: 'step-2', position: 2 },
        { id: 'step-3', position: 3 },
      ];

      await batchUpdateDripStepPositions(updates);

      expect(supabase.from).toHaveBeenCalledTimes(3);
      expect(supabase.from).toHaveBeenCalledWith('drip_steps');
    });

    it('should throw DatabaseError if any update fails', async () => {
      let callCount = 0;
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            return Promise.resolve({ error: { message: 'Update failed' } });
          }
          return Promise.resolve({ error: null });
        }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      const updates = [
        { id: 'step-1', position: 1 },
        { id: 'step-2', position: 2 },
      ];

      await expect(batchUpdateDripStepPositions(updates)).rejects.toThrow(DatabaseError);
    });
  });

  describe('createDripStep', () => {
    it('should create a new drip step', async () => {
      const newStep: Partial<DripStep> = {
        sequence_id: 'seq-1',
        position: 1,
        delay_type: 'immediate',
        delay_value: 0,
        delay_unit: 'minutes',
        channel: 'email',
        email_subject: 'Test Subject',
        email_body: 'Test Body',
      };

      const mockChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { sequence_id: 'seq-1' }, error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      const result = await createDripStep(newStep);

      expect(supabase.from).toHaveBeenCalledWith('drip_steps');
      expect(mockChain.insert).toHaveBeenCalledWith([newStep]);
      expect(result).toEqual({ sequence_id: 'seq-1' });
    });

    it('should throw DatabaseError on creation failure', async () => {
      const mockChain = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Creation failed' },
        }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      await expect(createDripStep({ sequence_id: 'seq-1' })).rejects.toThrow(DatabaseError);
    });
  });

  describe('updateDripStep', () => {
    it('should update a drip step', async () => {
      const updates: Partial<DripStep> = {
        delay_type: 'after',
        delay_value: 2,
        delay_unit: 'hours',
        channel: 'sms',
        sms_body: 'Updated SMS',
      };

      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { sequence_id: 'seq-1' }, error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      const result = await updateDripStep('step-1', updates);

      expect(supabase.from).toHaveBeenCalledWith('drip_steps');
      expect(mockChain.update).toHaveBeenCalledWith(updates);
      expect(mockChain.eq).toHaveBeenCalledWith('id', 'step-1');
      expect(result).toEqual({ sequence_id: 'seq-1' });
    });

    it('should return null if step not found', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      const result = await updateDripStep('non-existent', { channel: 'sms' });

      expect(result).toBeNull();
    });

    it('should throw DatabaseError on update failure', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Update failed' },
        }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      await expect(updateDripStep('step-1', { channel: 'sms' })).rejects.toThrow(DatabaseError);
    });
  });

  describe('getDripStepById', () => {
    it('should fetch a step by ID', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { sequence_id: 'seq-1' }, error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      const result = await getDripStepById('step-1');

      expect(supabase.from).toHaveBeenCalledWith('drip_steps');
      expect(mockChain.select).toHaveBeenCalledWith('sequence_id');
      expect(mockChain.eq).toHaveBeenCalledWith('id', 'step-1');
      expect(result).toEqual({ sequence_id: 'seq-1' });
    });

    it('should return null if step not found', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      const result = await getDripStepById('non-existent');

      expect(result).toBeNull();
    });

    it('should throw DatabaseError on failure', async () => {
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Fetch failed' },
        }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      await expect(getDripStepById('step-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('deleteDripStep', () => {
    it('should delete a drip step', async () => {
      const mockChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      await deleteDripStep('step-1');

      expect(supabase.from).toHaveBeenCalledWith('drip_steps');
      expect(mockChain.delete).toHaveBeenCalled();
      expect(mockChain.eq).toHaveBeenCalledWith('id', 'step-1');
    });

    it('should throw DatabaseError on deletion failure', async () => {
      const mockChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: 'Delete failed' } }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      await expect(deleteDripStep('step-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('cancelPendingDripJobsForDeal', () => {
    it('should cancel all pending drip jobs for a deal', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ data: [{ id: 'job-1' }, { id: 'job-2' }], error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      const result = await cancelPendingDripJobsForDeal('deal-1', 'Manual cancellation');

      expect(supabase.from).toHaveBeenCalledWith('deal_drip_jobs');
      expect(mockChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
          last_error: 'Manual cancellation',
        })
      );
      expect(mockChain.eq).toHaveBeenCalledWith('deal_id', 'deal-1');
      expect(mockChain.eq).toHaveBeenCalledWith('status', 'pending');
      expect(result).toBe(2);
    });

    it('should return 0 if no pending jobs found', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      const result = await cancelPendingDripJobsForDeal('deal-1');

      expect(result).toBe(0);
    });

    it('should use default reason when not provided', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      await cancelPendingDripJobsForDeal('deal-1');

      expect(mockChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          last_error: 'Deal archived',
        })
      );
    });

    it('should throw DatabaseError on failure', async () => {
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Cancel failed' },
        }),
      };
      (supabase.from as Mock).mockReturnValue(mockChain);

      await expect(cancelPendingDripJobsForDeal('deal-1')).rejects.toThrow(DatabaseError);
    });
  });
});
