import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { executeHitlDecision } from './engine';
import { recordOperatorAudit } from './audit';
import type { OperatorHitlActionRequest } from './types';

const APPROVAL_SECRET = process.env.OPERATOR_APPROVAL_SECRET || process.env.CRON_SECRET || 'lgq-operator-default-secret-salt';

/**
 * Generates an HMAC-SHA256 signature for a 1-click mobile approval action
 */
export function generateApprovalToken(
  actionId: string,
  decision: 'approved' | 'rejected',
  expiresAtMs: number,
  secret = APPROVAL_SECRET,
): string {
  const payload = `${actionId}:${decision}:${expiresAtMs}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verifies that the incoming 1-click approval request signature is valid and unexpired
 */
export function verifyApprovalToken(
  actionId: string,
  decision: 'approved' | 'rejected',
  expiresAtMs: number,
  token: string,
  secret = APPROVAL_SECRET,
): boolean {
  if (Date.now() > expiresAtMs) {
    return false;
  }
  const expectedToken = generateApprovalToken(actionId, decision, expiresAtMs, secret);
  return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expectedToken, 'hex'));
}

/**
 * Generates interactive Slack and Telegram notification payloads for a pending HITL action
 */
export function formatInteractiveApprovalPayload(
  action: OperatorHitlActionRequest,
  baseUrl = 'https://app.letsgetquoted.com',
) {
  const expiresAtMs = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  const approveToken = generateApprovalToken(action.id, 'approved', expiresAtMs);
  const rejectToken = generateApprovalToken(action.id, 'rejected', expiresAtMs);

  const approveUrl = `${baseUrl}/api/webhooks/operator-approval?actionId=${action.id}&decision=approved&expires=${expiresAtMs}&token=${approveToken}`;
  const rejectUrl = `${baseUrl}/api/webhooks/operator-approval?actionId=${action.id}&decision=rejected&expires=${expiresAtMs}&token=${rejectToken}`;

  // Slack Block Kit format
  const slackPayload = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🚨 AI Operator: ${action.title}` },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Category:* \`${action.category.toUpperCase()}\`\n*Description:* ${action.description}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ 1-Click Approve' },
            style: 'primary',
            url: approveUrl,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Reject' },
            style: 'danger',
            url: rejectUrl,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '🔍 Open Console' },
            url: `${baseUrl}/admin/operator`,
          },
        ],
      },
    ],
  };

  // Telegram Markdown format
  const telegramText = `🚨 *AI Operator Approval Request*\n\n*Action:* ${action.title}\n*Category:* \`${action.category}\`\n*Details:* ${action.description}\n\n[✅ 1-Click Approve](${approveUrl})  |  [❌ Reject](${rejectUrl})  |  [🔍 Console](${baseUrl}/admin/operator)`;

  return {
    approveUrl,
    rejectUrl,
    slackPayload,
    telegramText,
  };
}

/**
 * Dispatches the interactive approval card to configured Slack / Telegram endpoints
 */
export async function dispatchInteractiveApprovalNotification(
  action: OperatorHitlActionRequest,
) {
  const { slackPayload, telegramText } = formatInteractiveApprovalPayload(action);
  let dispatched = false;

  // 1. Slack Webhook
  const slackWebhookUrl = process.env.OPERATOR_SLACK_WEBHOOK_URL;
  if (slackWebhookUrl) {
    try {
      await fetch(slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackPayload),
      });
      dispatched = true;
    } catch (err) {
      console.error('[approval-bridge] Slack webhook dispatch failed:', err);
    }
  }

  // 2. Telegram Bot API
  const telegramBotToken = process.env.OPERATOR_TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.OPERATOR_TELEGRAM_CHAT_ID;
  if (telegramBotToken && telegramChatId) {
    try {
      await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: telegramText,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      });
      dispatched = true;
    } catch (err) {
      console.error('[approval-bridge] Telegram dispatch failed:', err);
    }
  }

  return { dispatched };
}

/**
 * Executes a signed approval decision from a mobile webhook callback
 */
export async function processMobileApprovalCallback(
  supabase: SupabaseClient,
  params: {
    actionId: string;
    decision: 'approved' | 'rejected';
    expires: string;
    token: string;
  },
) {
  const expiresAtMs = parseInt(params.expires, 10);
  if (isNaN(expiresAtMs) || !params.token) {
    return { success: false, error: 'Invalid expiration or signature token.' };
  }

  const isValid = verifyApprovalToken(params.actionId, params.decision, expiresAtMs, params.token);
  if (!isValid) {
    return { success: false, error: 'Invalid cryptographic signature or token has expired.' };
  }

  // Execute decision via AI Operator Engine
  const result = executeHitlDecision(params.actionId, params.decision, 'mobile-1click-webhook', 'Executed via signed mobile 1-click bridge');

  if (result.success) {
    recordOperatorAudit({
      category: 'sre_platform',
      actionName: 'operator.mobile_approval_executed',
      severity: 'safe_auto',
      toolName: 'processMobileApprovalCallback',
      inputPayload: { actionId: params.actionId, decision: params.decision },
      outputResult: result,
      reasoningSummary: `Mobile 1-click ${params.decision} executed successfully via cryptographically verified token.`,
      status: 'success',
    });
  }

  return result;
}
