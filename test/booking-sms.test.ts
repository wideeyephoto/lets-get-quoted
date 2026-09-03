import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { bookingRequestCustomerConfirmationText, ownerBookingRequestAlertText } from '@/lib/sms-templates';
import { SMS_CATALOGUE, CATALOGUE_SENDERS } from '@/lib/sms-catalogue';

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const BOOKING_LIB = read('src/lib/booking.ts');
const SMS_LIB = read('src/lib/sms.ts');

describe('booking request SMS templates', () => {
  it('formats the customer confirmation text with first name, business name, whenLabel, and opt-out', () => {
    const text = bookingRequestCustomerConfirmationText({
      businessName: 'Apex Roofing',
      customerName: 'Sarah Jenkins',
      whenLabel: 'Thu, Sep 10, 8:00 AM – 12:00 PM',
      serviceName: 'Roof Inspection',
    });

    expect(text).toContain('Hi Sarah');
    expect(text).toContain('Apex Roofing');
    expect(text).toContain('Roof Inspection');
    expect(text).toContain('Thu, Sep 10, 8:00 AM – 12:00 PM');
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('formats customer confirmation gracefully without service or full name', () => {
    const text = bookingRequestCustomerConfirmationText({
      businessName: 'Apex Roofing',
      whenLabel: 'Thu, Sep 10, 8:00 AM – 12:00 PM',
    });

    expect(text).toContain('Hi there');
    expect(text).toContain('Apex Roofing');
    expect(text).toContain('Thu, Sep 10, 8:00 AM – 12:00 PM');
    expect(text).toContain('Reply STOP to opt out.');
  });

  it('formats the owner alert text with customer name, requested window, and dashboard link', () => {
    const text = ownerBookingRequestAlertText({
      businessName: 'Apex Roofing',
      customerName: 'John Doe',
      whenLabel: 'Fri, Sep 11, 1:00 PM – 5:00 PM',
      serviceName: 'Gutter Cleaning',
      dashboardUrl: 'https://app.letsgetquoted.com/dashboard/schedule',
    });

    expect(text).toContain('Apex Roofing');
    expect(text).toContain('John Doe');
    expect(text).toContain('Fri, Sep 11, 1:00 PM – 5:00 PM');
    expect(text).toContain('Gutter Cleaning');
    expect(text).toContain('https://app.letsgetquoted.com/dashboard/schedule');
    expect(text).toContain('Reply STOP to opt out.');
  });
});

describe('booking request senders are registered in catalogue', () => {
  it('includes both senders in CATALOGUE_SENDERS', () => {
    expect(CATALOGUE_SENDERS).toContain('sendBookingRequestCustomerConfirmationSms');
    expect(CATALOGUE_SENDERS).toContain('sendOwnerBookingRequestAlertSms');
  });

  it('includes both entries in SMS_CATALOGUE', () => {
    const ids = SMS_CATALOGUE.map((e) => e.id);
    expect(ids).toContain('booking-request-confirmation');
    expect(ids).toContain('owner-booking-request-alert');
  });
});

describe('booking request SMS dispatch wiring', () => {
  it('wires sendBookingRequestCustomerConfirmationSms in createBooking', () => {
    expect(BOOKING_LIB).toContain('sendBookingRequestCustomerConfirmationSms(');
    expect(BOOKING_LIB).toContain('sendOwnerBookingRequestAlertSms(');
  });

  it('implements sendBookingRequestCustomerConfirmationSms in sms.ts', () => {
    expect(SMS_LIB).toContain('export async function sendBookingRequestCustomerConfirmationSms(');
    expect(SMS_LIB).toContain('export async function sendOwnerBookingRequestAlertSms(');
  });

  it('verifies owner alert phone before dispatching owner booking alert SMS', () => {
    expect(SMS_LIB).toContain('export async function isOwnerPhoneVerified(');
    expect(SMS_LIB).toContain('await isOwnerPhoneVerified(params.accountId, to)');
  });

  it('passes ownerAlerts verification status from page to BookingSetup', () => {
    const bookingPage = read('src/app/dashboard/schedule/booking/page.tsx');
    const bookingSetup = read('src/app/dashboard/schedule/booking/BookingSetup.tsx');

    expect(bookingPage).toContain('loadOwnerAlerts(accountId)');
    expect(bookingPage).toContain('ownerAlerts=');
    expect(bookingSetup).toContain('isOwnerVerified');
    expect(bookingSetup).toContain('Verified &amp; active');
    expect(bookingSetup).toContain('Unverified');
  });
});
