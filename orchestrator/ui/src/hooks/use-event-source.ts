'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export type ConnectionState = 'connecting' | 'open' | 'closed' | 'error';

interface UseEventSourceResult {
  data: string[];
  connectionState: ConnectionState;
  close: () => void;
}

export function useEventSource(url: string | null): UseEventSourceResult {
  const [data, setData] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const esRef = useRef<EventSource | null>(null);

  const close = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
      setConnectionState('closed');
    }
  }, []);

  useEffect(() => {
    if (!url) {
      setConnectionState('closed');
      return;
    }

    setData([]);
    setConnectionState('connecting');

    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setConnectionState('open');
    };

    es.onmessage = (event) => {
      setData((prev) => [...prev, event.data]);
    };

    es.addEventListener('log', (event) => {
      setData((prev) => [...prev, (event as MessageEvent).data]);
    });

    es.addEventListener('complete', () => {
      setConnectionState('closed');
      es.close();
    });

    es.addEventListener('error', (event) => {
      // SSE error event from server
      const msg = (event as MessageEvent).data;
      if (msg) setData((prev) => [...prev, `ERROR: ${msg}`]);
      setConnectionState('closed');
      es.close();
    });

    es.onerror = () => {
      // Connection error — stream may have ended normally
      if (es.readyState === EventSource.CLOSED) {
        setConnectionState('closed');
      } else {
        setConnectionState('error');
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [url]);

  return { data, connectionState, close };
}
