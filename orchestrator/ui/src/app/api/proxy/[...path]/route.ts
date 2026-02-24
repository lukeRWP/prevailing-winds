import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:8500';

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const token = request.cookies.get('pw_token')?.value;
  if (!token) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { path } = await params;
  const apiPath = `/api/${path.join('/')}`;
  const url = new URL(apiPath, API_URL);

  // Forward query params
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  // Check if this is an SSE stream request
  const isSSE = path[path.length - 1] === 'stream';

  if (isSSE) {
    const upstream = await fetch(url.toString(), {
      headers,
      cache: 'no-store',
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { success: false, message: 'Stream failed' },
        { status: upstream.status }
      );
    }

    return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // Regular API proxy
  const body = request.method !== 'GET' && request.method !== 'HEAD'
    ? await request.text().catch(() => null)
    : null;

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const upstream = await fetch(url.toString(), {
    method: request.method,
    headers,
    body,
    cache: 'no-store',
  });

  const data = await upstream.text();

  return new NextResponse(data, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('Content-Type') || 'application/json' },
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
