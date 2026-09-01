import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { processMobileApprovalCallback } from '@/lib/ai-operator/approval-bridge';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const actionId = url.searchParams.get('actionId') || '';
  const decision = (url.searchParams.get('decision') || '') as 'approved' | 'rejected';
  const expires = url.searchParams.get('expires') || '';
  const token = url.searchParams.get('token') || '';

  if (!actionId || (decision !== 'approved' && decision !== 'rejected') || !expires || !token) {
    return new Response(renderResultHtml(false, 'Missing required approval parameters.', actionId, decision), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const admin = createAdminClient();
  const result = await processMobileApprovalCallback(admin, {
    actionId,
    decision,
    expires,
    token,
  });

  const statusCode = result.success ? 200 : 400;
  return new Response(
    renderResultHtml(
      result.success,
      result.success
        ? `Action "${actionId}" has been successfully ${decision.toUpperCase()} and executed.`
        : (result.error || 'Execution failed.'),
      actionId,
      decision,
    ),
    {
      status: statusCode,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    },
  );
}

function renderResultHtml(
  success: boolean,
  message: string,
  actionId: string,
  decision: string,
): string {
  const icon = success ? (decision === 'approved' ? '✅' : '❌') : '⚠️';
  const title = success
    ? `Action ${decision === 'approved' ? 'Approved' : 'Rejected'}`
    : 'Approval Execution Error';
  const color = success ? (decision === 'approved' ? '#34d399' : '#f87171') : '#f59e0b';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} · Let's Get Quoted AI Operator</title>
  <style>
    body {
      margin: 0;
      padding: 2rem 1rem;
      background: #08121f;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 80vh;
    }
    .card {
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 2rem;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }
    .icon { font-size: 3rem; margin-bottom: 0.5rem; }
    h1 { margin: 0.5rem 0; font-size: 1.35rem; color: ${color}; }
    p { color: #cbd5e1; font-size: 0.95rem; line-height: 1.5; margin: 1rem 0; }
    .meta { font-size: 0.8rem; color: #94a3b8; font-family: monospace; background: #040812; padding: 0.5rem; border-radius: 6px; }
    .btn {
      display: inline-block;
      margin-top: 1.5rem;
      padding: 0.6rem 1.25rem;
      background: #0284c7;
      color: #ffffff;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.88rem;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="meta">Action ID: ${actionId || 'N/A'}</div>
    <a href="https://app.letsgetquoted.com/admin/operator" class="btn">Open Operator Console</a>
  </div>
</body>
</html>`;
}
