import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/contacts/field-vcard/route';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: vi.fn(),
}));

vi.mock('@/lib/sms', () => ({
  getSharedFieldPhoneNumber: vi.fn(),
}));

vi.mock('@/lib/phone', () => ({
  displayPhone: vi.fn(),
}));

vi.mock('@/lib/sms-field-templates', () => ({
  formatFieldVcard: vi.fn(),
}));

describe('Field vCard Route', () => {
  let createAdminClientMock: any;
  let createSupabaseServerClientMock: any;
  let loadBusinessNameMock: any;
  let getSharedFieldPhoneNumberMock: any;
  let displayPhoneMock: any;
  let formatFieldVcardMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { account_id: 'acct_123' } })
            })
          })
        })
      })
    });

    createSupabaseServerClientMock = (await import('@/lib/supabase-server')).createSupabaseServerClient;
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user_123' } } }) }
    });

    loadBusinessNameMock = (await import('@/lib/business-name')).loadBusinessName;
    loadBusinessNameMock.mockResolvedValue('Test Company');

    getSharedFieldPhoneNumberMock = (await import('@/lib/sms')).getSharedFieldPhoneNumber;
    getSharedFieldPhoneNumberMock.mockResolvedValue('+15551234567');

    displayPhoneMock = (await import('@/lib/phone')).displayPhone;
    displayPhoneMock.mockReturnValue('(555) 123-4567');

    formatFieldVcardMock = (await import('@/lib/sms-field-templates')).formatFieldVcard;
    formatFieldVcardMock.mockReturnValue('VCARD DATA');
  });

  it('generates vcard for authenticated user', async () => {
    const res = await GET();
    
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/vcard');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="Test_Company_Field_Line.vcf"');
    
    const text = await res.text();
    expect(text).toBe('VCARD DATA');
    
    expect(formatFieldVcardMock).toHaveBeenCalledWith('Test Company', '(555) 123-4567');
  });

  it('generates vcard with fallback values when unauthenticated', async () => {
    createSupabaseServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) }
    });
    
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('Company_Field_Line.vcf');
    expect(formatFieldVcardMock).toHaveBeenCalledWith('Company', '(555) 123-4567');
  });

  it('generates vcard with fallback phone when phone not found', async () => {
    getSharedFieldPhoneNumberMock.mockResolvedValue(null);
    displayPhoneMock.mockReturnValue('(248) 555-0199');
    
    const res = await GET();
    expect(res.status).toBe(200);
    expect(formatFieldVcardMock).toHaveBeenCalledWith('Test Company', '(248) 555-0199');
  });

  it('cleans business name for vcard format', async () => {
    loadBusinessNameMock.mockResolvedValue('Company;Name\r\nInc, LLC');
    
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="Company_Name__Inc__LLC_Field_Line.vcf"');
    expect(formatFieldVcardMock).toHaveBeenCalledWith('Company Name  Inc  LLC', '(555) 123-4567');
  });

  it('handles server errors gracefully', async () => {
    formatFieldVcardMock.mockImplementation(() => { throw new Error('Formatting failed'); });
    
    const res = await GET();
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe('Failed to generate contact card');
  });
});
