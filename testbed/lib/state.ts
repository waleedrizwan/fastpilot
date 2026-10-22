// Mutable state: global stores (orders, tickets) and per-session state (cart,
// active challenge, pass flashes), plus server-side challenge reporting.

import { challenge } from '../challenges.ts';
import { SEED_ORDERS, SEED_TICKETS, type Order, type Ticket } from './data.ts';
import { record, resultFor, type Attempt } from './results.ts';
import type { Req, Session } from './http.ts';

export interface CartLine { slug: string; qty: number; color: string; size: string; saved?: boolean }

export const stores = {
  orders: structuredClone(SEED_ORDERS) as Order[],
  tickets: structuredClone(SEED_TICKETS) as Ticket[],
};

export function resetStores(): void {
  stores.orders = structuredClone(SEED_ORDERS);
  stores.tickets = structuredClone(SEED_TICKETS);
}

export const cartOf = (s: Session): CartLine[] => (s.data.cart ??= []);
export const cartCount = (s: Session) => cartOf(s).filter((l) => !l.saved).reduce((n, l) => n + l.qty, 0);

/** The challenge started from the catalog, kept in a cookie as "<id>|<start ms>". */
export function activeChallenge(req: Req): { id: string; start: number } | null {
  const [id, start] = (req.cookies.gch ?? '').split('|');
  return id && challenge(id) ? { id, start: Number(start) || 0 } : null;
}

interface Flash { id: string; status: Attempt['status']; code?: string; detail?: string }

/**
 * Records a result decided on the server. By default a banner is queued for the next page this session
 * renders; JSON endpoints pass queue=false and return the flash for the page script to show (G.api does).
 */
export function report(req: Req, id: string, status: Attempt['status'], detail?: string, queue = true): Flash {
  if (!challenge(id)) throw new Error(`unknown challenge ${id}`);
  const active = activeChallenge(req);
  const ms = active?.id === id && active.start ? Date.now() - active.start : undefined;
  const res = record(id, { status, detail, ms });
  const flash: Flash = { id, status, detail, code: status === 'pass' ? res.code : undefined };
  if (queue) (req.session.data.flashes ??= []).push(flash);
  return flash;
}

export function takeFlashes(s: Session): Flash[] {
  const list: Flash[] = s.data.flashes ?? [];
  s.data.flashes = [];
  return list;
}

export const statusOf = (id: string) => resultFor(id).status;

/** Sends signed-out visitors to the login page. Returns false when it redirected. */
export function requireUser(req: Req): boolean {
  if (req.session.user) return true;
  req.res.writeHead(302, { Location: `/login?next=${encodeURIComponent(req.url.pathname + req.url.search)}`, 'Cache-Control': 'no-store' });
  req.res.end();
  return false;
}
