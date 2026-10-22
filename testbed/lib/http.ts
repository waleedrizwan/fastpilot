// Small HTTP layer on node:http: routing, body parsing (urlencoded, JSON,
// multipart), cookies, in-memory sessions and static files.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isRaw, type Raw } from './html.ts';

export interface Upload { field: string; filename: string; type: string; size: number }

export interface Session {
  id: string;
  user: string | null;
  csrf: string;
  /** Per-area state (cart, checkout, app data). Each area initialises its own key. */
  data: Record<string, any>;
}

/** The two origins the testbed serves, for cross-origin frames and popups. */
export interface Site { main: string; other: string; isOther: boolean }

export interface Req {
  method: string;
  url: URL;
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  cookies: Record<string, string>;
  form: URLSearchParams;
  json: any;
  files: Upload[];
  session: Session;
  site: Site;
  raw: IncomingMessage;
  res: ServerResponse;
}

type Handler = (req: Req) => unknown;
interface Route { method: string; re: RegExp; keys: string[]; handler: Handler }

const routes: Route[] = [];
const sessions = new Map<string, Session>();
const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES: Record<string, string> = {
  '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain', '.csv': 'text/csv', '.pdf': 'application/pdf',
  '.html': 'text/html',
};

/** Registers a route. Patterns use `:name` for one segment and a trailing `*` for the rest. */
export function route(method: string, pattern: string, handler: Handler): void {
  const keys: string[] = [];
  const src = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })
    .replace(/\*$/, () => { keys.push('rest'); return '(.*)'; });
  routes.push({ method, re: new RegExp(`^${src}$`), keys, handler });
}
export const get = (p: string, h: Handler) => route('GET', p, h);
export const post = (p: string, h: Handler) => route('POST', p, h);

let notFound: Handler = (req) => send(req, 404, 'Not found', { 'Content-Type': 'text/plain' });
let onError: (req: Req, e: unknown) => void = (req, e) => send(req, 500, String(e), { 'Content-Type': 'text/plain' });
export const setNotFound = (h: Handler) => { notFound = h; };
export const setErrorPage = (h: (req: Req, e: unknown) => void) => { onError = h; };

export function resetSessions(): void {
  sessions.clear();
}

export function send(req: Req, status: number, body: string | Buffer, headers: Record<string, string | string[]> = {}): void {
  const res = req.res;
  if (res.headersSent) return;
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(req.method === 'HEAD' ? undefined : body);
}

export const html = (req: Req, body: Raw | string, status = req.res.statusCode) =>
  send(req, status, isRaw(body) ? body.__html : body, { 'Content-Type': 'text/html; charset=utf-8' });

export const json = (req: Req, data: unknown, status = 200) =>
  send(req, status, JSON.stringify(data), { 'Content-Type': 'application/json' });

export const redirect = (req: Req, location: string, status = 302) => send(req, status, '', { Location: location });

export function setCookie(req: Req, name: string, value: string, opts = 'Path=/; SameSite=Lax'): void {
  const prev = req.res.getHeader('Set-Cookie');
  const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : [];
  req.res.setHeader('Set-Cookie', [...list, `${name}=${encodeURIComponent(value)}; ${opts}`]);
}

function parseCookies(header = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const i = pair.indexOf('=');
    if (i > 0) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  }
  return out;
}

function readBody(raw: IncomingMessage, limit = 25 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    raw.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); raw.destroy(); } else chunks.push(c);
    });
    raw.on('end', () => resolve(Buffer.concat(chunks)));
    raw.on('error', reject);
  });
}

function parseMultipart(buf: Buffer, boundary: string, form: URLSearchParams, files: Upload[]): void {
  const delim = Buffer.from(`--${boundary}`);
  let at = buf.indexOf(delim);
  while (at !== -1) {
    at += delim.length;
    if (buf.subarray(at, at + 2).toString() === '--') break;
    at += 2;
    const end = buf.indexOf(delim, at);
    if (end === -1) break;
    const part = buf.subarray(at, end - 2);
    const sep = part.indexOf('\r\n\r\n');
    const head = part.subarray(0, sep).toString();
    const body = part.subarray(sep + 4);
    const name = /name="([^"]*)"/i.exec(head)?.[1] ?? '';
    const filename = /filename="([^"]*)"/i.exec(head)?.[1];
    if (filename === undefined) form.append(name, body.toString());
    else if (filename) files.push({ field: name, filename, type: /content-type:\s*([^\s;]+)/i.exec(head)?.[1] ?? '', size: body.length });
    at = end;
  }
}

function session(cookies: Record<string, string>, res: ServerResponse): Session {
  const existing = cookies.gsid && sessions.get(cookies.gsid);
  if (existing) return existing;
  const s: Session = { id: randomBytes(12).toString('hex'), user: null, csrf: randomBytes(8).toString('hex'), data: {} };
  sessions.set(s.id, s);
  res.setHeader('Set-Cookie', [`gsid=${s.id}; Path=/; HttpOnly; SameSite=Lax`]);
  return s;
}

function serveStatic(req: Req, rest: string): void {
  const file = normalize(join(PUBLIC, rest));
  if (!file.startsWith(PUBLIC) || !existsSync(file) || !statSync(file).isFile()) return finish(req, notFound(req));
  req.res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(req.res);
}

/**
 * Sends a handler's return value (markup or a string) unless it already responded. Anything else is
 * ignored: `(req) => setTimeout(() => json(req, …), 500)` returns a timer, and the handler answers later.
 */
function finish(req: Req, out: unknown): void {
  if (!req.res.headersSent && !req.res.writableEnded && (typeof out === 'string' || isRaw(out))) html(req, out);
}

/** Request handler for one listener. `site` is read per request, so origins can be filled in after listen(). */
export function handler(site: Site) {
  return async (raw: IncomingMessage, res: ServerResponse) => {
    const url = new URL(raw.url ?? '/', `http://${raw.headers.host ?? 'localhost'}`);
    const cookies = parseCookies(raw.headers.cookie);
    const req: Req = {
      method: raw.method ?? 'GET', url, path: url.pathname, query: url.searchParams, params: {}, cookies,
      form: new URLSearchParams(), json: null, files: [], session: session(cookies, res),
      site, raw, res,
    };
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        const body = await readBody(raw);
        const type = raw.headers['content-type'] ?? '';
        if (type.startsWith('application/x-www-form-urlencoded')) req.form = new URLSearchParams(body.toString());
        else if (type.startsWith('application/json')) req.json = body.length ? JSON.parse(body.toString()) : null;
        else if (type.startsWith('multipart/form-data')) {
          const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(type);
          if (boundary) parseMultipart(body, boundary[1] ?? boundary[2], req.form, req.files);
        }
      }
      if (req.path.startsWith('/static/')) return serveStatic(req, req.path.slice('/static/'.length));
      const method = req.method === 'HEAD' ? 'GET' : req.method;
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.re.exec(req.path);
        if (!m) continue;
        r.keys.forEach((k, i) => { req.params[k] = decodeURIComponent(m[i + 1]); });
        return finish(req, await r.handler(req));
      }
      finish(req, await notFound(req));
    } catch (e) {
      console.error(e);
      if (!res.headersSent) onError(req, e);
    }
  };
}
