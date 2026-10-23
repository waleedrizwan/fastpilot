```
                         HOW FASTPILOT DRIVES THE BROWSER
                         ================================

  ┌──────────────┐   task    ┌─────────────────────────────────────────────┐
  │  Side panel  │──────────▶│  Background service worker  (index.ts)      │
  │  (you type)  │◀──────────│  runTask() → new Agent(settings).run()      │
  └──────────────┘ live log  └──────────────┬──────────────────────────────┘
  ┌──────────────┐  jobs via                │  opens a tab in FastPilot's own
  │ Gauntlet     │  local server            │  window (minimized for tests)
  │ runner       │─────────────────────────▶│  and attaches chrome.debugger (CDP)
  └──────────────┘  (bridge.ts)             ▼
                     ┌──────────────────────────────────────┐
                     │ 0. Saved run for this site + task?   │── yes ─▶ replay steps,
                     │    (replay.ts, if enabled)           │          then let the
                     └──────────────────┬───────────────────┘          model check
                                        │ no / afterwards
 ╔══════════════════════════════════════▼════════════════════════════════════════╗
 ║                         AGENT LOOP  (agent.ts, ≤ max steps)                   ║
 ║                                                                               ║
 ║  ┌─────────────────────────────────────────────┐                              ║
 ║  │ 1. SNAPSHOT  (page.ts → content/snapshot)   │  injected script reads the   ║
 ║  │    [3] button "Add to cart"                 │  page: up to 300 interactive ║
 ║  │    [4] textbox "Search" (below)             │  elements with ref numbers,  ║
 ║  │    # Checkout                               │  plus headings               ║
 ║  └───────────────────────┬─────────────────────┘                              ║
 ║                          │                                                    ║
 ║          ┌───────────────┴────────────────┐                                   ║
 ║          ▼                                ▼  (in parallel, if Jev is on)      ║
 ║  ┌────────────────────────┐   ┌──────────────────────────────┐                ║
 ║  │ 2. MODEL (streaming)   │   │ JEV (~170 ms)                │                ║
 ║  │ system prompt + task + │   │ guesses the next action and  │                ║
 ║  │ recent history + snap  │   │ "is the task done?" (0..1)   │                ║
 ║  │ (+ screenshot if asked)│   │ finish mode: ≥ 0.9 → stop    │──▶ DONE        ║
 ║  └───────────┬────────────┘   └──────────────────────────────┘                ║
 ║              │ tool calls run AS SOON AS each one finishes streaming          ║
 ║              ▼                                                                ║
 ║  ┌─────────────────────────────────────────────────────────────┐              ║
 ║  │ 3. ACT  (tools.ts)        one batch, run in order           │              ║
 ║  │   click(ref) type(ref,text) select key scroll hover         │              ║
 ║  │   read_text screenshot wait_for navigate done handoff       │              ║
 ║  │                                                             │              ║
 ║  │   ref ─▶ scroll into view ─▶ element's position on screen   │              ║
 ║  │                │                                            │              ║
 ║  │                ▼   input.ts + humanize.ts                   │              ║
 ║  │   CDP Input.dispatchMouseEvent / dispatchKeyEvent           │              ║
 ║  │   • curved mouse path, press/hold timing, key delays        │              ║
 ║  │   • real trusted events (isTrusted = true)                  │              ║
 ║  │   • overlay draws pointer/keys on the page (if shown)       │              ║
 ║  │                │                                            │              ║
 ║  │                ▼   settle (page.ts)                         │              ║
 ║  │   wait for: tab loaded + network quiet + DOM quiet          │              ║
 ║  │                                                             │              ║
 ║  │   page navigated / action failed ─▶ skip rest of batch,     │              ║
 ║  │                                     stop the model's stream │              ║
 ║  └───────────────────────┬─────────────────────────────────────┘              ║
 ║                          ▼                                                    ║
 ║  ┌─────────────────────────────────────────────────────────────┐              ║
 ║  │ 4. CHECK                                                    │              ║
 ║  │   done(result) / handoff(reason) ───────────────────────────┼──▶ FINISH    ║
 ║  │   no tool calls (plain reply) ──────────────────────────────┼──▶ FINISH    ║
 ║  │   same page + same actions again? ─ 2× nudge, 6× stop ──────┼──▶ STALLED   ║
 ║  │   tab left allowed sites (tests) ───────────────────────────┼──▶ STOP      ║
 ║  │   otherwise: add results to history ─▶ back to 1            │              ║
 ║  └─────────────────────────────────────────────────────────────┘              ║
 ╚═══════════════════════════════════════╤═══════════════════════════════════════╝
                                         ▼
               ┌────────────────────────────────────────────────┐
               │ FINISH: save successful steps for replay,      │
               │ detach debugger, report to panel / runner      │
               └────────────────────────────────────────────────┘
```
