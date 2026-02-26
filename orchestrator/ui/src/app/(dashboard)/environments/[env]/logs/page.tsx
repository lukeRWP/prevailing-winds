'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Play, Square, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/hooks/use-app';

interface ServiceInfo {
  service: string;
  role: string;
  host: string | null;
  available: boolean;
}

const SERVICE_LABELS: Record<string, string> = {
  'app-server': 'App Server (systemd)',
  'imp-server-out': 'IMP Server Log',
  'imp-server-err': 'IMP Server Errors',
  'app-client': 'App Client (systemd)',
  'nginx-access': 'Nginx Access',
  'nginx-error': 'Nginx Error',
  'mysql': 'MySQL Error',
  'mysql-slow': 'MySQL Slow Query',
  'minio': 'MinIO',
};

export default function ServerLogsPage() {
  const params = useParams<{ env: string }>();
  const envName = params.env;
  const { currentApp } = useApp();

  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [selectedService, setSelectedService] = useState('');
  const [lines, setLines] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch available services
  useEffect(() => {
    async function fetchServices() {
      try {
        const res = await fetch(`/api/proxy/_x_/apps/${currentApp}/envs/${envName}/server-logs`);
        const data = await res.json();
        if (data.success) {
          setServices(data.data);
          const first = data.data.find((s: ServiceInfo) => s.available);
          if (first) setSelectedService(first.service);
        }
      } catch { /* silent */ }
    }
    if (currentApp) fetchServices();
  }, [currentApp, envName]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  // Stop stream when unmounting
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleSnapshot = useCallback(async () => {
    if (!selectedService || !currentApp) return;
    setLoading(true);
    setLines([]);
    stopStream();

    try {
      const res = await fetch(
        `/api/proxy/_x_/apps/${currentApp}/envs/${envName}/server-logs/snapshot?service=${selectedService}&lines=500`
      );
      const data = await res.json();
      if (data.success) {
        setLines(data.data.lines || []);
      } else {
        setLines([`Error: ${data.message}`]);
      }
    } catch (err) {
      setLines([`Error: Failed to fetch logs`]);
    } finally {
      setLoading(false);
    }
  }, [selectedService, currentApp, envName]);

  const startStream = useCallback(() => {
    if (!selectedService || !currentApp) return;
    stopStream();
    setLines([]);
    setStreaming(true);

    const url = `/api/proxy/_x_/apps/${currentApp}/envs/${envName}/server-logs/stream?service=${selectedService}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('log', (event) => {
      try {
        const line = JSON.parse(event.data);
        setLines((prev) => [...prev, line]);
      } catch {
        setLines((prev) => [...prev, event.data]);
      }
    });

    es.addEventListener('error', (event) => {
      if (event instanceof MessageEvent) {
        try {
          const msg = JSON.parse(event.data);
          setLines((prev) => [...prev, `[ERROR] ${msg}`]);
        } catch {
          setLines((prev) => [...prev, `[ERROR] ${event.data}`]);
        }
      }
    });

    es.addEventListener('done', () => {
      setStreaming(false);
      es.close();
    });

    es.onerror = () => {
      setStreaming(false);
      es.close();
    };
  }, [selectedService, currentApp, envName]);

  function stopStream() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStreaming(false);
  }

  const selectedHost = services.find((s) => s.service === selectedService)?.host;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <Link
          href={`/environments/${envName}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to {envName.toUpperCase()}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Server Logs — {envName.toUpperCase()}
        </h1>
        <p className="text-sm text-muted-foreground">
          Live log streaming from {envName} VMs via SSH
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedService}
          onChange={(e) => { setSelectedService(e.target.value); stopStream(); setLines([]); }}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {services.filter((s) => s.available).map((s) => (
            <option key={s.service} value={s.service}>
              {SERVICE_LABELS[s.service] || s.service} ({s.host})
            </option>
          ))}
        </select>

        <button
          onClick={handleSnapshot}
          disabled={loading || streaming}
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
        >
          <Download className="h-3 w-3" />
          Snapshot (500 lines)
        </button>

        {!streaming ? (
          <button
            onClick={startStream}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
          >
            <Play className="h-3 w-3" />
            Stream Live
          </button>
        ) : (
          <button
            onClick={stopStream}
            className="flex items-center gap-1.5 rounded-md border border-red-500/50 bg-red-500/10 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Square className="h-3 w-3" />
            Stop
          </button>
        )}

        {streaming && (
          <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Streaming from {selectedHost}
          </span>
        )}

        <span className="text-[10px] text-muted-foreground ml-auto">{lines.length} lines</span>
      </div>

      {/* Log output */}
      <div
        ref={logRef}
        className="rounded-md border border-border bg-zinc-950 overflow-auto max-h-[600px] min-h-[400px] font-mono"
      >
        {lines.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-xs text-muted-foreground">
              {loading ? 'Fetching logs...' : 'Select a service and click Snapshot or Stream Live'}
            </p>
          </div>
        ) : (
          <div className="p-2">
            {lines.map((line, i) => (
              <div
                key={i}
                className={cn(
                  'text-[11px] leading-5 px-1 whitespace-pre-wrap break-all',
                  line.startsWith('[ERROR]')
                    ? 'text-red-400 bg-red-500/5'
                    : 'text-zinc-300 hover:bg-zinc-900/50'
                )}
              >
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
