import { EventEmitter } from 'node:events';
import type { ServerEvent } from '@woltron/shared';

/**
 * Tiny typed event hub. Everything that should reach SSE clients (and Electron's main
 * process, which listens on the same emitter) goes through `emit`.
 *
 * Listeners: `hub.on('event', (e: ServerEvent) => …)`.
 */
export class EventHub extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(200);
  }

  publish(event: ServerEvent): void {
    this.emit('event', event);
  }

  subscribe(fn: (event: ServerEvent) => void): () => void {
    this.on('event', fn);
    return () => this.off('event', fn);
  }
}
