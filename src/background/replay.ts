// Replays a saved run without the model. Each recorded element is found again
// by its fingerprint; the first step that can't be found or fails ends the replay.

import type { LogEvent } from '../shared/types';
import { stepSummary, type RecordedStep, type Recording } from '../shared/recordings';
import { resolveTarget, type Target } from '../content/snapshot';
import { sleep } from './humanize';
import { inPage, snapshot } from './page';
import { runTool, type ToolCtx } from './tools';

/** How long to wait for a recorded element to show up (late-loading content). */
const FIND_TIMEOUT_MS = 2500;

export interface ReplayResult {
  done: RecordedStep[];
  failure?: { step: RecordedStep; reason: string };
}

async function find(tabId: number, target: Target, signal: AbortSignal): Promise<number | null> {
  const deadline = performance.now() + FIND_TIMEOUT_MS;
  for (;;) {
    await snapshot(tabId);
    const ref = await inPage(tabId, resolveTarget, [target]);
    if (ref !== null || performance.now() > deadline || signal.aborted) return ref;
    await sleep(150);
  }
}

export async function replay(rec: Recording, ctx: ToolCtx, emit: (e: LogEvent) => void, signal: AbortSignal): Promise<ReplayResult> {
  const done: RecordedStep[] = [];
  for (const step of rec.steps) {
    if (signal.aborted) throw new Error('Stopped');
    const t0 = performance.now();
    emit({ kind: 'action', text: `↻ ${stepSummary(step)}` });

    const args: Record<string, unknown> = { ...step.args };
    if (step.target) {
      const ref = await find(ctx.dbg.tabId, step.target, signal);
      if (ref === null) return { done, failure: { step, reason: 'element not found on the page' } };
      args.ref = ref;
    }

    let text: string;
    try {
      text = (await runTool(ctx, step.tool, args)).text;
    } catch (e: any) {
      text = `error: ${e?.message ?? e}`;
    }
    const ok = !text.startsWith('error') && !(step.tool === 'wait_for' && text.startsWith('timed out'));
    emit({ kind: ok ? 'result' : 'error', text, ms: Math.round(performance.now() - t0) });
    if (!ok) return { done, failure: { step, reason: text } };
    done.push(step);
  }
  return { done };
}
