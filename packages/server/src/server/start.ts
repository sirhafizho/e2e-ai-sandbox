import { serve, upgradeWebSocket } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { createApp } from './app.js';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

export function startServer() {
  const wss = new WebSocketServer({ noServer: true });
  const { app } = createApp(upgradeWebSocket);

  const server = serve(
    {
      fetch: app.fetch,
      port: PORT,
      websocket: { server: wss },
    },
    (info) => {
      console.log(`Forge server running on http://localhost:${info.port}`);
      console.log(`WebSocket endpoint: ws://localhost:${info.port}/ws/sessions/:id`);
      console.log('Press Ctrl+C to stop');
    },
  );

  return server;
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
