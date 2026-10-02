#!/usr/bin/env node
import { startServer } from './index.js';

const server = await startServer().catch((e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') console.error(`[woltron] port already in use — set WOLTRON_PORT to pick another one`);
  else console.error('[woltron] failed to start:', e);
  process.exit(1);
});

console.log(`[woltron] open ${server.url}`);

let stopping = false;
const shutdown = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  console.log(`[woltron] ${signal} — saving and shutting down…`);
  await server.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
