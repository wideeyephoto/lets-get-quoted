import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listMessageTemplates, createMessageTemplate, deleteMessageTemplate } from '@/lib/message-templates';

describe('Message Templates Lib', () => {
  let supabaseMock: any;
  let queryMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    queryMock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      single: vi.fn(),
    };

    supabaseMock = {
      from: vi.fn(() => queryMock),
    };
  });

  describe('listMessageTemplates', () => {
    it('returns empty array on error', async () => {
      queryMock.then = vi.fn((resolve) => resolve({ error: { message: 'db error' } }));
      const res = await listMessageTemplates(supabaseMock, 'acct1');
      expect(res).toEqual([]);
    });

    it('returns array of templates', async () => {
      const templates = [{ id: 't1' }, { id: 't2' }];
      queryMock.then = vi.fn((resolve) => resolve({ data: templates, error: null }));
      const res = await listMessageTemplates(supabaseMock, 'acct1');
      expect(res).toEqual(templates);
    });
  });

  describe('createMessageTemplate', () => {
    it('throws error if insert fails', async () => {
      queryMock.single.mockResolvedValue({ error: new Error('Insert failed') });
      await expect(createMessageTemplate(supabaseMock, 'acct1', { title: 'T', body: 'B' }))
        .rejects.toThrow('Insert failed');
    });

    it('inserts and returns template', async () => {
      const template = { id: 't1', title: 'T', body: 'B' };
      queryMock.single.mockResolvedValue({ data: template, error: null });
      const res = await createMessageTemplate(supabaseMock, 'acct1', { title: ' T ', body: ' B ' });
      
      expect(queryMock.insert).toHaveBeenCalledWith(expect.objectContaining({
        account_id: 'acct1',
        title: 'T', // trimmed
        body: 'B',  // trimmed
      }));
      expect(res).toEqual(template);
    });
  });

  describe('deleteMessageTemplate', () => {
    it('throws error if delete fails', async () => {
      queryMock.then = vi.fn((resolve) => resolve({ error: new Error('Delete failed') }));
      await expect(deleteMessageTemplate(supabaseMock, 'acct1', 't1'))
        .rejects.toThrow('Delete failed');
    });

    it('deletes successfully', async () => {
      queryMock.then = vi.fn((resolve) => resolve({ error: null }));
      await expect(deleteMessageTemplate(supabaseMock, 'acct1', 't1')).resolves.toBeUndefined();
      expect(queryMock.delete).toHaveBeenCalled();
    });
  });
});
