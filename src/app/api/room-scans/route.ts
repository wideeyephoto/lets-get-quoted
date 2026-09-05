import { NextResponse } from 'next/server';
import { getCurrentMembership } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { loadRoomScan, saveRoomScan, type RoomScanTarget } from '@/lib/property-intel/room-scan-store';
import { MAX_ROOM_SCAN_BYTES, parseCustomScanJson } from '@/lib/property-intel/room-scan-validation';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function context(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Sign in to manage room scans.' }, { status: 401 }) };
  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId || membership.role !== 'owner') return { error: NextResponse.json({ error: 'Owner access required.' }, { status: 403 }) };
  const query = new URL(request.url).searchParams;
  const kind = query.get('kind'), id = query.get('id');
  if ((kind !== 'job' && kind !== 'lead') || !id || !UUID.test(id)) return { error: NextResponse.json({ error: 'Choose a valid job or lead.' }, { status: 400 }) };
  return { supabase, accountId: membership.accountId, target: { kind, id } as RoomScanTarget };
}

export async function GET(request: Request) {
  const auth = await context(request);
  if (auth.error) return auth.error;
  try {
    const result = await loadRoomScan(auth.supabase, auth.accountId, auth.target);
    return result ? NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
      : NextResponse.json({ error: 'Job or lead not found.' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Could not load the saved scan. Try again.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await context(request);
  if (auth.error) return auth.error;
  // Bound the actual stream; Content-Length alone is optional and untrusted.
  let raw = '';
  const reader = request.body?.getReader();
  if (!reader) return NextResponse.json({ error: 'Choose a scan JSON file.' }, { status: 400 });
  try {
    const decoder = new TextDecoder();
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_ROOM_SCAN_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: 'Scan JSON must be 1 MB or smaller.' }, { status: 413 });
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
    parseCustomScanJson(raw);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid scan JSON.' }, { status: 400 });
  } finally { reader.releaseLock(); }
  try {
    const scan = await saveRoomScan(auth.supabase, auth.accountId, auth.target, raw);
    return scan ? NextResponse.json({ scan }) : NextResponse.json({ error: 'Job or lead not found.' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Could not save this scan. Try again.' }, { status: 500 });
  }
}
