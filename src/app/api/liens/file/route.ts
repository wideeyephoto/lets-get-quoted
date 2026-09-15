import { NextResponse } from 'next/server';
export async function POST(req: Request) { return NextResponse.json({ error: 'Direct filing integration is currently disabled pending provider pilot.' }, { status: 403 }); }
