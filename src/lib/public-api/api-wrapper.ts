import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/auth';
import { clientIpFrom, checkRateLimitStrict } from '@/lib/rate-limit';
import {
  verifyApiToken,
  type ApiScope,
  type VerifiedApiToken,
} from '@/lib/public-api/api-credentials';

export type PublicApiContext = {
  admin: SupabaseClient;
  accountId: string;
  credentialId: string;
  tokenName: string;
  scopes: Set<ApiScope>;
  requestId: string;
  clientIp: string;
};

export type PublicApiOptions = {
  requiredScope?: ApiScope;
  requireIdempotency?: boolean;
  rateLimit?: {
    limit: number;
    windowSeconds: number;
  };
};

export type StandardErrorResponse = {
  error: {
    code:
      | 'invalid_api_key'
      | 'insufficient_scope'
      | 'invalid_request'
      | 'not_found'
      | 'idempotency_conflict'
      | 'rate_limited'
      | 'internal_error';
    message: string;
    details?: unknown;
  };
  request_id: string;
};

const DEFAULT_RATE_LIMIT = {
  limit: 120,
  windowSeconds: 60,
};

const IDEMPOTENCY_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateRequestId(): string {
  return `req_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

function errorResponse(
  status: number,
  code: StandardErrorResponse['error']['code'],
  message: string,
  requestId: string,
  details?: unknown
): NextResponse<StandardErrorResponse> {
  const body: StandardErrorResponse = {
    error: { code, message, ...(details !== undefined ? { details } : {}) },
    request_id: requestId,
  };
  return NextResponse.json(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-Id': requestId,
    },
  });
}

/**
 * Higher-order Route Handler wrapper for all Public API v1 endpoints.
 */
export function publicApiRoute<T = unknown>(
  handler: (
    req: NextRequest,
    ctx: PublicApiContext,
    params?: { params: Promise<Record<string, string>> }
  ) => Promise<NextResponse<T | StandardErrorResponse | unknown> | Response>,
  options: PublicApiOptions = {}
) {
  return async function (
    req: NextRequest,
    routeSegment: { params: Promise<Record<string, string>> }
  ): Promise<Response> {
    const requestId = generateRequestId();
    const startTime = Date.now();
    const clientIp = clientIpFrom(req.headers);
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const method = req.method;
    const path = req.nextUrl.pathname;
    const admin = createAdminClient();

    let credentialId: string | null = null;
    let accountId: string | null = null;
    let finalStatus = 500;
    let finalErrorCode: string | null = null;

    try {
      // 1. Authenticate Bearer API token
      const authHeader = req.headers.get('authorization')?.trim();
      if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
        finalStatus = 401;
        finalErrorCode = 'invalid_api_key';
        return errorResponse(
          401,
          'invalid_api_key',
          "A valid Bearer API token is required. Set your header to 'Authorization: Bearer lgq_live_...'",
          requestId
        );
      }

      const rawToken = authHeader.slice(7).trim();
      const verified = await verifyApiToken(admin, rawToken);
      if (!verified) {
        finalStatus = 401;
        finalErrorCode = 'invalid_api_key';
        return errorResponse(
          401,
          'invalid_api_key',
          'API token is invalid, expired, revoked, or the associated workspace is suspended.',
          requestId
        );
      }

      credentialId = verified.credentialId;
      accountId = verified.accountId;

      // 2. Scope Verification
      if (options.requiredScope && !verified.scopes.has(options.requiredScope)) {
        finalStatus = 403;
        finalErrorCode = 'insufficient_scope';
        return errorResponse(
          403,
          'insufficient_scope',
          `This operation requires the '${options.requiredScope}' scope.`,
          requestId,
          {
            required_scope: options.requiredScope,
            granted_scopes: Array.from(verified.scopes),
          }
        );
      }

      // 3. Rate Limiting
      const rlConfig = options.rateLimit ?? DEFAULT_RATE_LIMIT;
      const rateLimitBucket = `api_rate:${verified.accountId}:${verified.credentialId}`;
      const allowed = await checkRateLimitStrict(
        admin,
        rateLimitBucket,
        rlConfig.limit,
        rlConfig.windowSeconds
      );

      if (!allowed) {
        finalStatus = 429;
        finalErrorCode = 'rate_limited';
        const res = errorResponse(
          429,
          'rate_limited',
          `Rate limit of ${rlConfig.limit} requests per ${rlConfig.windowSeconds}s exceeded.`,
          requestId
        );
        res.headers.set('X-RateLimit-Limit', String(rlConfig.limit));
        res.headers.set('X-RateLimit-Remaining', '0');
        res.headers.set('Retry-After', String(rlConfig.windowSeconds));
        return res;
      }

      // 4. Idempotency Check for Mutating Endpoints
      const idempotencyKey = req.headers.get('idempotency-key')?.trim();
      let rawBodyText: string | null = null;
      let requestPayloadHash: string | null = null;

      if (['POST', 'PATCH', 'PUT'].includes(method)) {
        if (options.requireIdempotency && !idempotencyKey) {
          finalStatus = 400;
          finalErrorCode = 'invalid_request';
          return errorResponse(
            400,
            'invalid_request',
            "The 'Idempotency-Key' header is required for this mutating request.",
            requestId
          );
        }

        if (idempotencyKey) {
          rawBodyText = await req.clone().text();
          requestPayloadHash = createHash('sha256')
            .update(`${method}:${path}:${rawBodyText}`, 'utf8')
            .digest('hex');

          // Check if idempotency record exists
          const { data: existingIdem } = await admin
            .from('api_idempotency_records')
            .select('request_hash, response_status, response_body, expires_at')
            .eq('account_id', verified.accountId)
            .eq('idempotency_key', idempotencyKey)
            .maybeSingle();

          if (existingIdem) {
            if (existingIdem.request_hash !== requestPayloadHash) {
              finalStatus = 409;
              finalErrorCode = 'idempotency_conflict';
              return errorResponse(
                409,
                'idempotency_conflict',
                'The provided Idempotency-Key has already been used with a different request payload.',
                requestId
              );
            }

            if (new Date(existingIdem.expires_at).getTime() > Date.now()) {
              finalStatus = existingIdem.response_status;
              const replayRes = NextResponse.json(existingIdem.response_body, {
                status: existingIdem.response_status,
                headers: {
                  'Content-Type': 'application/json',
                  'X-Request-Id': requestId,
                  'Idempotent-Replay': 'true',
                },
              });
              return replayRes;
            }
          }
        }
      }

      // 5. Execute Handler
      const ctx: PublicApiContext = {
        admin,
        accountId: verified.accountId,
        credentialId: verified.credentialId,
        tokenName: verified.name,
        scopes: verified.scopes,
        requestId,
        clientIp,
      };

      const handlerResponse = await handler(req, ctx, routeSegment);
      finalStatus = handlerResponse.status;

      // Add Standard Public API Response Headers
      handlerResponse.headers.set('X-Request-Id', requestId);
      handlerResponse.headers.set('X-RateLimit-Limit', String(rlConfig.limit));

      // 6. Save Idempotency Record on non-500 completion
      if (idempotencyKey && requestPayloadHash && finalStatus < 500) {
        try {
          const bodyJson = await handlerResponse.clone().json().catch(() => null);
          if (bodyJson) {
            await admin.from('api_idempotency_records').upsert(
              {
                account_id: verified.accountId,
                idempotency_key: idempotencyKey,
                request_path: path,
                request_hash: requestPayloadHash,
                response_status: finalStatus,
                response_body: bodyJson,
                expires_at: new Date(Date.now() + IDEMPOTENCY_EXPIRY_MS).toISOString(),
              },
              { onConflict: 'account_id,idempotency_key' }
            );
          }
        } catch {
          // Idempotency save error must not fail the successful user action
        }
      }

      return handlerResponse;
    } catch (unhandledError) {
      finalStatus = 500;
      finalErrorCode = 'internal_error';
      console.error(`[Public API v1 Error] (${requestId}) ${method} ${path}:`, unhandledError);
      return errorResponse(
        500,
        'internal_error',
        'An unexpected server error occurred while processing your request.',
        requestId
      );
    } finally {
      // Asynchronous Audit Log Record
      if (accountId) {
        const durationMs = Math.max(1, Date.now() - startTime);
        admin
          .from('api_request_audit')
          .insert({
            account_id: accountId,
            credential_id: credentialId,
            request_id: requestId,
            method,
            path,
            status: finalStatus,
            ip_address: clientIp,
            user_agent: userAgent.slice(0, 200),
            duration_ms: durationMs,
            error_code: finalErrorCode,
          })
          .then();
      }
    }
  };
}
