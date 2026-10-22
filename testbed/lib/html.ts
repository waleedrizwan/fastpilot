// Escaping HTML templates. h`...` escapes every interpolated value unless it is
// already markup (another h`` result or raw()). Arrays are joined.

export interface Raw { readonly __html: string }

export const raw = (s: string): Raw => ({ __html: s });
export const isRaw = (v: unknown): v is Raw => typeof v === 'object' && v !== null && '__html' in v;

export function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function part(v: unknown): string {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.map(part).join('');
  if (isRaw(v)) return v.__html;
  return esc(v);
}

export function h(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += part(values[i]) + strings[i + 1];
  return raw(out);
}

/** JSON for a <script type="application/json"> block. */
export const jsonScript = (id: string, data: unknown): Raw =>
  raw(`<script type="application/json" id="${esc(id)}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`);

export const money = (n: number) => `$${n.toFixed(2)}`;
