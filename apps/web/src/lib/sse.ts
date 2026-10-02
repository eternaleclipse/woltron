import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ServerEvent } from '@woltron/shared';
import { eventsUrl } from './api';
import { onRun, qk } from './queries';

type ConnState = 'connecting' | 'open' | 'lost';
let state: ConnState = 'connecting';
const listeners = new Set<() => void>();
const setState = (s: ConnState) => {
  if (s === state) return;
  state = s;
  listeners.forEach((l) => l());
};

export function useConnectionState(): ConnState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

type Handler = (e: ServerEvent) => void;
const eventHandlers = new Set<Handler>();
/** Subscribe to raw server events from anywhere (e.g. run detail page animations). */
export function useServerEvent(handler: Handler) {
  useEffect(() => {
    eventHandlers.add(handler);
    return () => {
      eventHandlers.delete(handler);
    };
  }, [handler]);
}

/** Mount once at the app root: keeps the query cache in sync with server events. */
export function useServerEvents(onNavigateRun?: (runId: string) => void) {
  const qc = useQueryClient();
  useEffect(() => {
    let es: EventSource | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lostTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      es = new EventSource(eventsUrl());
      es.onopen = () => {
        retry = 0;
        clearTimeout(lostTimer);
        if (state === 'lost') {
          // we were away — refresh everything
          qc.invalidateQueries();
        }
        setState('open');
      };
      es.onmessage = (msg) => {
        let ev: ServerEvent;
        try {
          ev = JSON.parse(msg.data);
        } catch {
          return;
        }
        handle(ev);
        eventHandlers.forEach((h) => h(ev));
      };
      es.onerror = () => {
        es?.close();
        // Show the banner only if we stay disconnected for a bit.
        clearTimeout(lostTimer);
        lostTimer = setTimeout(() => setState('lost'), state === 'open' ? 2500 : 4000);
        const delay = Math.min(15000, 800 * 2 ** retry++);
        timer = setTimeout(connect, delay);
      };
    };

    const handle = (ev: ServerEvent) => {
      switch (ev.type) {
        case 'run.updated':
          onRun(qc, ev.run);
          break;
        case 'preset.changed':
          qc.invalidateQueries({ queryKey: qk.presets });
          break;
        case 'pack.changed':
          qc.invalidateQueries({ queryKey: qk.packs });
          break;
        case 'automation.changed':
          qc.invalidateQueries({ queryKey: qk.automations });
          break;
        case 'automation.fired':
          qc.invalidateQueries({ queryKey: qk.automations });
          qc.invalidateQueries({ queryKey: qk.runs });
          break;
        case 'settings.updated':
          qc.setQueryData(qk.settings, ev.settings);
          break;
        case 'notification': {
          const fn = ev.level === 'success' ? toast.success : ev.level === 'error' ? toast.error : ev.level === 'warn' ? toast.warning : toast;
          fn(ev.title, {
            description: ev.body,
            action: ev.runId && onNavigateRun ? { label: 'View run', onClick: () => onNavigateRun(ev.runId!) } : undefined,
          });
          break;
        }
        case 'hello':
          break;
      }
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(lostTimer);
      es?.close();
    };
  }, [qc, onNavigateRun]);
}
