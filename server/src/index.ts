import { serve } from '@hono/node-server';
import app from './app.js';

const port = Number(process.env["PORT"] || 1337);

serve({ fetch: app.fetch, port }, () => {
  console.log(`Synvapp API lista en http://localhost:${port}/api/health`);
});
