// Gauntlet: a test site for browser agents. Serves the same app on two origins
// (localhost:5175 and 127.0.0.1:5176) so cross-origin frames and popups are real.
//
//   npm run testbed            start on the default ports
//   PORT=6000 OTHER_PORT=6001 npm run testbed

import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { handler, setErrorPage, setNotFound, type Site } from './lib/http.ts';
import { h } from './lib/html.ts';
import { errorPage } from './lib/layout.ts';
import { configureResults } from './lib/results.ts';
import './routes/index.ts';

setNotFound((req) => {
  req.res.statusCode = 404;
  return errorPage(req, 404, 'Page not found', h`Nothing lives at <code>${req.path}</code>. It may have moved, or the link was wrong.`);
});
setErrorPage((req, e) => {
  req.res.statusCode = 500;
  req.res.setHeader('Content-Type', 'text/html; charset=utf-8');
  req.res.end(errorPage(req, 500, 'Something went wrong', String(e)).__html);
});

const listen = (server: Server, port: number) =>
  new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve((server.address() as { port: number }).port));
  });

export interface Running { main: string; other: string; close(): Promise<void> }

export async function start(opts: { port?: number; otherPort?: number; persist?: boolean } = {}): Promise<Running> {
  configureResults({ persist: opts.persist ?? false });
  const mainSite: Site = { main: '', other: '', isOther: false };
  const otherSite: Site = { main: '', other: '', isOther: true };
  const servers = [createServer(handler(mainSite)), createServer(handler(otherSite))];
  const [p1, p2] = [await listen(servers[0], opts.port ?? 5175), await listen(servers[1], opts.otherPort ?? 5176)];
  const main = `http://localhost:${p1}`, other = `http://127.0.0.1:${p2}`;
  Object.assign(mainSite, { main, other });
  Object.assign(otherSite, { main, other });
  return {
    main, other,
    close: async () => {
      for (const s of servers) s.closeAllConnections();
      await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = process.env;
  const run = await start({ port: Number(env.PORT) || undefined, otherPort: Number(env.OTHER_PORT) || undefined, persist: true });
  console.log(`Gauntlet running at ${run.main} (second origin ${run.other})`);
  console.log(`Challenges: ${run.main}/challenges   Scoreboard: ${run.main}/scoreboard`);
}
