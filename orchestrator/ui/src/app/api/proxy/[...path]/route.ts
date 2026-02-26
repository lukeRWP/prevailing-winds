import { NextRequest, NextResponse } from 'next/server';
import { auth, resolveApiToken } from '@/lib/auth';

const API_URL = process.env.API_URL || 'http://localhost:8500';

async function proxyRequest(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session?.user?.pwRole) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const token = resolveApiToken(session.user.pwRole, session.user.pwApp);
  if (!token) {
    return NextResponse.json(
      { success: false, message: 'No API token configured for your role' },
      { status: 403 }
    );
  }

  const { path } = await params;
  // API routes use /api/ prefix, but health/metrics do not
  const joined = path.join('/');
  const needsApiPrefix = /^_[xyu pd]_\//.test(joined);
  const apiPath = needsApiPrefix ? `/api/${joined}` : `/${joined}`;
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

  // Check if this is a binary upload (file restore)
  const reqContentType = request.headers.get('content-type') || '';
  const isUpload = reqContentType.includes('application/octet-stream');

  let body: BodyInit | null = null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    if (isUpload) {
      body = request.body;
      headers['Content-Type'] = 'application/octet-stream';
      const cl = request.headers.get('content-length');
      if (cl) headers['Content-Length'] = cl;
      const xfn = request.headers.get('x-filename');
      if (xfn) headers['X-Filename'] = xfn;
    } else {
      const text = await request.text().catch(() => null);
      if (text) {
        body = text;
        headers['Content-Type'] = 'application/json';
      }
    }
  }

  const upstream = await fetch(url.toString(), {
    method: request.method,
    headers,
    body,
    cache: 'no-store',
    ...(isUpload ? { duplex: 'half' as const } : {}),
  });

  const upstreamContentType = upstream.headers.get('Content-Type') || 'application/json';

  // Binary download — stream through without buffering
  if (upstreamContentType.startsWith('application/gzip') ||
      upstreamContentType.startsWith('application/sql') ||
      upstreamContentType.startsWith('application/octet-stream')) {
    const respHeaders: Record<string, string> = { 'Content-Type': upstreamContentType };
    const cd = upstream.headers.get('Content-Disposition');
    if (cd) respHeaders['Content-Disposition'] = cd;
    const cl = upstream.headers.get('Content-Length');
    if (cl) respHeaders['Content-Length'] = cl;

    return new NextResponse(upstream.body, { status: upstream.status, headers: respHeaders });
  }

  // Regular JSON proxy
  const data = await upstream.text();

  return new NextResponse(data, {
    status: upstream.status,
    headers: { 'Content-Type': upstreamContentType },
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
