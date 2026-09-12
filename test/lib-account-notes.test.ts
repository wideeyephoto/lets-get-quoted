import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listAccountNotes, addAccountNote, listAccountTags, addAccountTag, removeAccountTag } from '@/lib/account-notes';

describe('Account Notes Lib', () => {
  let adminMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    adminMock = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ id: '1' }],
        error: null
      })
    };
  });

  describe('listAccountNotes', () => {
    it('returns notes', async () => {
      const res = await listAccountNotes(adminMock, 'acct_1');
      expect(res[0].id).toBe('1');
    });

    it('handles error', async () => {
      adminMock.order.mockResolvedValue({ data: null, error: new Error('fail') });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await listAccountNotes(adminMock, 'acct_1');
      expect(res).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('addAccountNote', () => {
    it('adds note', async () => {
      adminMock.insert.mockResolvedValue({ error: null });
      await addAccountNote(adminMock, 'acct_1', 'user_1', 'body');
      expect(adminMock.insert).toHaveBeenCalledWith({ account_id: 'acct_1', body: 'body', created_by: 'user_1' });
    });

    it('handles error', async () => {
      adminMock.insert.mockResolvedValue({ error: new Error('fail') });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await addAccountNote(adminMock, 'acct_1', 'user_1', 'body');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('listAccountTags', () => {
    it('returns tags', async () => {
      const res = await listAccountTags(adminMock, 'acct_1');
      expect(res[0].id).toBe('1');
    });

    it('handles error', async () => {
      adminMock.order.mockResolvedValue({ data: null, error: new Error('fail') });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await listAccountTags(adminMock, 'acct_1');
      expect(res).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('addAccountTag', () => {
    it('handles empty string', async () => {
      await addAccountTag(adminMock, 'acct_1', 'user_1', '  ');
      expect(adminMock.insert).not.toHaveBeenCalled();
    });

    it('adds tag', async () => {
      adminMock.insert.mockResolvedValue({ error: null });
      await addAccountTag(adminMock, 'acct_1', 'user_1', 'TAG');
      expect(adminMock.insert).toHaveBeenCalledWith({ account_id: 'acct_1', tag: 'tag', created_by: 'user_1' });
    });

    it('ignores duplicate error', async () => {
      adminMock.insert.mockResolvedValue({ error: { message: 'duplicate key' } });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await addAccountTag(adminMock, 'acct_1', 'user_1', 'tag');
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('handles other errors', async () => {
      adminMock.insert.mockResolvedValue({ error: { message: 'fail' } });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await addAccountTag(adminMock, 'acct_1', 'user_1', 'tag');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('removeAccountTag', () => {
    it('removes tag', async () => {
      adminMock.eq.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
      await removeAccountTag(adminMock, 'acct_1', 'tag_1');
    });

    it('handles error', async () => {
      adminMock.eq.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error('fail') }) });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await removeAccountTag(adminMock, 'acct_1', 'tag_1');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
