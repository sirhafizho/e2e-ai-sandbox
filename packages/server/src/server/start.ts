import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

export function startServer() {
  const { app } = createApp();

  const server = serve(
    {
      fetch: app.fetch,
      port: PORT,
    },
    (info) => {
      console.log(`Forge server running on http://localhost:${info.port}`);
      console.log('Press Ctrl+C to stop');
    },
  );

  return server;
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
