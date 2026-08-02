import { describe, it, expect } from 'vitest';
import { classifyEmail, emailFieldError, isMailable, suggestEmailFix } from '@/lib/email-quality';

// Sending reputation is earned per domain and lost to hard bounces, and every
// address collected here gets mailed repeatedly — quote, invoice, reminder,
// review ask, campaign. So one dead address is not one bad send; it is a bad
// send every time that customer's record is touched.
//
// The two failure directions matter differently. Letting junk through costs
// reputation slowly. Rejecting a real address costs the contractor the job
// immediately. These tests pin both edges.

describe('addresses that cannot deliver are refused', () => {
  const malformed = [
    '',
    '   ',
    'dana',
    'dana@',
    '@example.org',
    'dana@@gmail.com',
    'dana example@gmail.com',
    'dana@gmail',
    // The regex this replaced accepted every one of the next four.
    'a@b.c', // one-letter TLD does not exist
    'dana..whitfield@gmail.com', // consecutive dots in the local part
    '.dana@gmail.com',
    'dana@-gmail.com',
  ];

  for (const address of malformed) {
    it(`refuses ${JSON.stringify(address)}`, () => {
      expect(classifyEmail(address).valid).toBe(false);
      expect(emailFieldError(address)).toBeTruthy();
    });
  }

  it('refuses an address longer than the spec allows', () => {
    expect(classifyEmail(`${'a'.repeat(250)}@gmail.com`).valid).toBe(false);
    expect(classifyEmail(`${'a'.repeat(65)}@gmail.com`).valid).toBe(false);
  });

  it('refuses a numeric TLD, which is an IP-looking typo', () => {
    expect(classifyEmail('dana@192.168.1.1').valid).toBe(false);
  });
});

describe('real addresses are never refused', () => {
  // The expensive mistake. Every one of these is a deliverable address that a
  // stricter check could plausibly have thrown out.
  const real = [
    'dana@gmail.com',
    'dana.whitfield@gmail.com',
    'dana+quotes@gmail.com',
    "o'brien@example.co.uk",
    'dana_w@sbcglobal.net',
    'd@icloud.com',
    'dana-w@brokepipes.plumbing',
    'DANA@GMAIL.COM',
    'dana99@my-company.co',
    "isn't.easy@mail.example.museum",
  ];

  for (const address of real) {
    it(`accepts ${address}`, () => {
      const verdict = classifyEmail(address);
      expect(verdict.valid).toBe(true);
      expect(verdict.reason).not.toBe('malformed');
      expect(emailFieldError(address)).toBeNull();
    });
  }
});

describe('junk is kept but flagged, never rejected', () => {
  // A homeowner who types "none@none.com" to get past a required field still
  // has a phone number and still wants the work done. Dropping the whole
  // enquiry over the address would be the worse outcome by a distance.
  const junk = ['test@test.com', 'asdf@asdf.com', 'noemail@gmail.com', 'x@example.com', 'dana@mailinator.com'];

  for (const address of junk) {
    it(`keeps ${address} but marks it unmailable`, () => {
      const verdict = classifyEmail(address);
      expect(verdict.valid).toBe(true);
      expect(verdict.junk).toBe(true);
      expect(verdict.note).toBeTruthy();
      expect(isMailable(address)).toBe(false);
    });
  }

  it('names why, so the reason can be acted on differently', () => {
    expect(classifyEmail('dana@mailinator.com').reason).toBe('disposable');
    expect(classifyEmail('test@test.com').reason).toBe('placeholder');
    expect(classifyEmail('info@brokepipes.com').reason).toBe('role');
  });

  it('does not condemn a real mailbox for its name alone', () => {
    // "test@brokepipes.com" is a junk local part, but so be it — a person may
    // genuinely be reachable there. What matters is that the DOMAIN is real.
    expect(classifyEmail('dana@gmail.com').junk).toBe(false);
    expect(classifyEmail('sales.dana@brokepipes.com').junk).toBe(false);
    // "example.com" is reserved by the RFCs and can never receive mail.
    expect(classifyEmail('dana@example.com').junk).toBe(true);
  });
});

describe('suggestEmailFix', () => {
  it('catches the misses people actually make', () => {
    expect(suggestEmailFix('dana@gmial.com')).toBe('dana@gmail.com');
    expect(suggestEmailFix('dana@gmai.com')).toBe('dana@gmail.com');
    expect(suggestEmailFix('dana@gmail.co')).toBe('dana@gmail.com');
    expect(suggestEmailFix('dana@hotmial.com')).toBe('dana@hotmail.com');
    expect(suggestEmailFix('dana@yaho.com')).toBe('dana@yahoo.com');
    expect(suggestEmailFix('dana@outlok.com')).toBe('dana@outlook.com');
  });

  it('keeps the local part exactly as typed', () => {
    // Rewriting the half that wasn't wrong is how a suggestion becomes a bug.
    expect(suggestEmailFix('Dana.W+quotes@gmial.com')).toBe('Dana.W+quotes@gmail.com');
  });

  it('says nothing about an address that is already right', () => {
    expect(suggestEmailFix('dana@gmail.com')).toBeNull();
    expect(suggestEmailFix('dana@icloud.com')).toBeNull();
  });

  it('does not second-guess a small real domain', () => {
    // The expensive failure mode: a contractor's customer at their own company
    // domain, "corrected" to gmail, and the quote goes to a stranger.
    expect(suggestEmailFix('dana@brokepipes.com')).toBeNull();
    expect(suggestEmailFix('dana@royaloakhvac.net')).toBeNull();
    expect(suggestEmailFix('dana@mail.com')).toBeNull();
  });

  it('handles junk input without throwing', () => {
    expect(suggestEmailFix('')).toBeNull();
    expect(suggestEmailFix('nonsense')).toBeNull();
    expect(suggestEmailFix('@gmail.com')).toBeNull();
  });
});

describe('isMailable — the bulk-send gate', () => {
  it('passes a normal address', () => {
    expect(isMailable('dana@gmail.com')).toBe(true);
  });

  it('stops both the undeliverable and the pointless', () => {
    expect(isMailable('a@b.c')).toBe(false);
    expect(isMailable('test@test.com')).toBe(false);
    expect(isMailable('dana@mailinator.com')).toBe(false);
    expect(isMailable('info@brokepipes.com')).toBe(false);
    expect(isMailable(null)).toBe(false);
    expect(isMailable(undefined)).toBe(false);
  });
});
