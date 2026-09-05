import { Resend } from 'resend';
import type { MerchandiseOrder, ShippingAddress } from './types';

let resendClient: Resend | null = null;
function getResend() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

/**
 * Sends order confirmation and digital proof receipt to the customer.
 */
export async function sendCustomerMerchandiseReceipt(params: {
  order: MerchandiseOrder;
  customerEmail: string;
  customerName: string;
  shippingAddress: ShippingAddress;
}): Promise<boolean> {
  const resend = getResend();
  if (!resend || !params.customerEmail) {
    return false;
  }

  const itemsList = params.order.items
    .map(
      (it) =>
        `<tr>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${it.productName} (${it.colorName})</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${it.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">$${it.totalPrice.toFixed(2)}</td>
        </tr>`
    )
    .join('');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
      <div style="background: #2563eb; padding: 24px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Order Confirmed & Approved</h1>
        <p style="color: #bfdbfe; margin: 6px 0 0 0; font-size: 14px;">Order #${params.order.orderNumber}</p>
      </div>
      <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px; background: #ffffff;">
        <p>Hi ${params.customerName},</p>
        <p>Thank you for your order! Your digital proof has been approved and your custom contractor merchandise has been routed to high-precision manufacturing.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <thead>
            <tr style="background: #f8fafc;">
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #cbd5e1;">Item</th>
              <th style="padding: 8px; text-align: center; border-bottom: 2px solid #cbd5e1;">Qty</th>
              <th style="padding: 8px; text-align: right; border-bottom: 2px solid #cbd5e1;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${itemsList}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding: 8px; text-align: right; font-weight: bold;">Subtotal:</td>
              <td style="padding: 8px; text-align: right;">$${params.order.subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding: 8px; text-align: right; font-weight: bold;">Shipping:</td>
              <td style="padding: 8px; text-align: right;">$${params.order.shippingCost.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding: 8px; text-align: right; font-weight: bold;">Sales Tax:</td>
              <td style="padding: 8px; text-align: right;">$${params.order.taxAmount.toFixed(2)}</td>
            </tr>
            <tr style="font-size: 16px;">
              <td colspan="2" style="padding: 8px; text-align: right; font-weight: bold; border-top: 2px solid #cbd5e1;">Total:</td>
              <td style="padding: 8px; text-align: right; font-weight: bold; border-top: 2px solid #cbd5e1;">$${params.order.totalAmount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <div style="background: #f1f5f9; padding: 14px; border-radius: 6px; margin: 20px 0; font-size: 13px;">
          <h4 style="margin: 0 0 6px 0;">Delivery Address:</h4>
          <div>${params.shippingAddress.fullName}</div>
          <div>${params.shippingAddress.streetAddress}${params.shippingAddress.apartmentSuite ? `, ${params.shippingAddress.apartmentSuite}` : ''}</div>
          <div>${params.shippingAddress.city}, ${params.shippingAddress.state} ${params.shippingAddress.postalCode}</div>
        </div>

        <p style="font-size: 13px; color: #64748b;">You will receive another update with carrier tracking as soon as your order ships from production.</p>
        <p style="font-size: 13px; color: #64748b; margin-top: 24px;">— The Let's Get Quoted Production Team</p>
      </div>
    </div>
  `;

  try {
    await resend.emails.send({
      from: "Let's Get Quoted <orders@letsgetquoted.com>",
      to: params.customerEmail,
      subject: `Order Confirmation #${params.order.orderNumber}`,
      html,
    });
    return true;
  } catch (err) {
    console.warn('Failed to send customer merchandise confirmation email:', err);
    return false;
  }
}

/**
 * Sends internal staff alert notification for new merchandise orders.
 */
export async function sendStaffMerchandiseAlert(params: {
  order: MerchandiseOrder;
  provider?: string;
  isSimulated?: boolean;
}): Promise<boolean> {
  const resend = getResend();
  const alertRecipient = process.env.STAFF_ALERT_EMAIL || 'hello@letsgetquoted.com';
  if (!resend) {
    return false;
  }

  const html = `
    <div style="font-family: monospace; font-size: 13px;">
      <h3>📦 New Merchandise Order: #${params.order.orderNumber}</h3>
      <p><strong>Account ID:</strong> ${params.order.accountId}</p>
      <p><strong>Retail Total:</strong> $${params.order.totalAmount.toFixed(2)} (Subtotal: $${params.order.subtotal.toFixed(2)}, Tax: $${params.order.taxAmount.toFixed(2)}, Ship: $${params.order.shippingCost.toFixed(2)})</p>
      <p><strong>Status:</strong> ${params.order.status}</p>
      <p><strong>Provider:</strong> ${params.provider || 'default'}${params.isSimulated ? ' (SIMULATED)' : ''}</p>
      <p><strong>Items:</strong> ${params.order.items.map((i) => `${i.quantity}x ${i.productName}`).join(', ')}</p>
      <p><strong>Ship To:</strong> ${params.order.shippingAddress.fullName}, ${params.order.shippingAddress.city}, ${params.order.shippingAddress.state}</p>
    </div>
  `;

  try {
    await resend.emails.send({
      from: "Let's Get Quoted Alerts <alerts@letsgetquoted.com>",
      to: alertRecipient,
      subject: `[Merchandise Order] #${params.order.orderNumber} ($${params.order.totalAmount.toFixed(2)})`,
      html,
    });
    return true;
  } catch (err) {
    console.warn('Failed to send staff merchandise alert email:', err);
    return false;
  }
}
