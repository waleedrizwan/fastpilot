# FastPilot agent loop and LLM call path: where time goes, and which decisions could become typed judgments

Scope: `src/background/agent.ts`, `src/background/llm/*`, `src/background/tools.ts`, `src/background/index.ts`, `src/background/page.ts`, `src/shared/types.ts`, plus the injected `src/content/*` helpers, `cdp.ts`, `input.ts` and `humanize.ts` where they set per-action latency. Replay, recordings, snapshot internals and settle tuning are covered in depth by another researcher; they appear here only where they touch the loop.

Citation convention: links point at source lines relative to this notes file (`../../src/...#Lnn`). "Measured" means I ran a script against the repo in a scratch directory on 2026-10-21 (details given inline). Nothing here comes from a live model run: the repo contains no recorded run telemetry (`testbed/.data/results.json` has an empty `attempts` object), and I did not run anything that needs an API key or a browser.

---

## 1. What happens from "user submits a task" to "task done", and what is in each prompt?

### Takeaway
One task is a single loop of at most `maxSteps` (default 40) turns. Each turn takes a fresh text snapshot of the page, sends one streaming chat-completions request (system prompt, task, up to 24 trimmed history messages, current snapshot), runs each tool call as soon as it has finished streaming, and appends the results to history. The model is planner, grounder (it picks `ref` numbers), verifier and finisher all at once. Every turn resends about 4.4 KB of fixed prompt (system prompt plus tool schemas) and up to 300 snapshot lines, which I estimate at roughly 14 KB, or about 4k tokens, at the cap.

### Cited Findings

**Entry (service worker → agent)**
- The side panel opens a long-lived port named `panel`. A `run` message creates a new `Agent` with freshly loaded settings and awaits `agent.run(task)`. Only one task can run at a time, and errors (including `AbortError` → "Stopped") are caught and reported to the panel. — [index.ts:10-30](../../src/background/index.ts#L10-L30)
- If the side panel disconnects, the running agent is stopped. — [index.ts:43](../../src/background/index.ts#L43)
- Defaults: OpenRouter base URL, model `anthropic/claude-haiku-5.5`, speed `fast`, `maxSteps: 40`, `replay: true`. — [shared/types.ts:13-20](../../src/shared/types.ts#L13-L20)
- The `Agent` constructor hard-codes `OpenAICompatProvider`. No other provider can be chosen today. — [agent.ts:34-36](../../src/background/agent.ts#L34-L36)

**Per-task setup** ([agent.ts:57-87](../../src/background/agent.ts#L57-L87))
- It validates the model and key, gets the active tab (rejecting `chrome://`, the Web Store and similar pages), attaches `chrome.debugger`, and wires detach to abort. — [agent.ts:58-64](../../src/background/agent.ts#L58-L64), [page.ts:9-19](../../src/background/page.ts#L9-L19)
- Attaching sends `Network.enable` and one `Runtime.evaluate` for the viewport, once per task. — [cdp.ts:19-28](../../src/background/cdp.ts#L19-L28)
- If replay is on and a recording exists for `origin|normalizedTask`, the recording is replayed first and a `note` is built for the model. On success the note says "Check the current page. If the task is complete, call done(result) now; otherwise continue". On failure it lists the successful steps and the reason. — [agent.ts:73-83](../../src/background/agent.ts#L73-L83), [recordings.ts:26-32](../../src/shared/recordings.ts#L26-L32)
- Even a fully successful replay is followed by at least one LLM turn whose only job is to verify completion and/or produce the answer. — [agent.ts:82](../../src/background/agent.ts#L82), [README.md "Saved runs"](../../README.md)

**Per-turn loop** ([agent.ts:89-174](../../src/background/agent.ts#L89-L174))
1. Check for abort. — [agent.ts:90](../../src/background/agent.ts#L90)
2. **Snapshot**: `snapshot(tabId)` → `chrome.scripting.executeScript(snapshotPage, [300])`, timed as `snapMs`. — [agent.ts:92-94](../../src/background/agent.ts#L92-L94), [page.ts:10](../../src/background/page.ts#L10), [page.ts:44-46](../../src/background/page.ts#L44-L46)
3. **Build messages**: `[system: SYSTEM_PROMPT] + [user: "Task: …" + note] + trimHistory(history) + [user: "Current page:\n" + snap.text (+ image if the previous turn took a screenshot)]`. The image is attached for one turn only. — [agent.ts:95-102](../../src/background/agent.ts#L95-L102)
4. **LLM call**: `provider.chat({messages, tools: TOOLS, signal, onToolCall})`. Each streamed tool call is chained onto a promise so calls run strictly in order while the model keeps streaming. — [agent.ts:104-148](../../src/background/agent.ts#L104-L148)
5. **Per-action `exec`**: skip if the batch has gone stale, parse JSON args, fingerprint the target element (`describeTarget`) for recordable tools, `runTool`, emit the result with its time in ms, record successful recordable steps, and set `skipRest` on `stale` or `final`. — [agent.ts:108-136](../../src/background/agent.ts#L108-L136)
6. Log `step N · <count> elements in <snapMs>ms · model <modelMs>ms (first token <firstTokenMs>ms)`, then wait for every queued action. — [agent.ts:149-153](../../src/background/agent.ts#L149-L153)
7. **Termination**: if the reply has no tool calls, the task ends as "done" with the reply text. — [agent.ts:154-157](../../src/background/agent.ts#L154-L157)
8. Push the assistant message (with `tool_calls`) and one `tool` message per result into history. If any result is `final` (`done` or `handoff`), emit it, save the recording on `done`, and return. — [agent.ts:159-173](../../src/background/agent.ts#L159-L173)
9. After `maxSteps`, emit "Stopped after N steps without finishing", then detach the debugger in `finally`. — [agent.ts:175-178](../../src/background/agent.ts#L175-L178)

**Prompt contents**
- The system prompt describes the snapshot format and the (above)/(below) markers. It tells the model to batch tool calls "whenever you can predict the outcome", to prefer `read_text` over screenshots, to keep text to one short line, that "Older snapshots are not kept, so write down facts you'll need later", and to finish with `done` or `handoff` on CAPTCHA, login, 2FA, payment or judgment calls. — [agent.ts:17-26](../../src/background/agent.ts#L17-L26)
- Measured: the system prompt is 1,027 characters (about 257 tokens at 4 chars/token). The 12 tool schemas serialize to 3,376 characters of JSON (about 844 tokens). Both are resent on every turn. (Measured by bundling `tools.ts` with the repo's esbuild into the scratch directory and reading `SYSTEM_PROMPT` from `agent.ts`.) — [agent.ts:17-26](../../src/background/agent.ts#L17-L26), [tools.ts:17-38](../../src/background/tools.ts#L17-L38)
- The request body is `model, messages, tools, tool_choice: 'auto', stream: true`, plus `provider: {sort: 'throughput'}` on OpenRouter. It sets no `max_tokens`, `temperature`, prompt-caching hints or usage reporting. — [openaiCompat.ts:25-33](../../src/background/llm/openaiCompat.ts#L25-L33)

**Snapshot format and size**
- The header is `URL`, `Title` (≤120 chars) and `Viewport WxH, scrolled y/max`. It is followed by one line per element, `[ref] kind "label" extras`, with `(above)`/`(below)` for off-screen items, and `# text` for visible H1–H3 headings. Headings count toward the 300-item budget. — [snapshot.ts:124-129](../../src/content/snapshot.ts#L124-L129), [snapshot.ts:153-166](../../src/content/snapshot.ts#L153-L166)
- Labels are capped at 80 chars. Input values are capped at 40 chars. A `<select>` line includes the selected text plus up to 10 options of ≤25 chars each. Flags such as checked/unchecked, expanded/collapsed, selected and disabled are appended. — [snapshot.ts:36](../../src/content/snapshot.ts#L36), [snapshot.ts:60-86](../../src/content/snapshot.ts#L60-L86)
- Selection keeps every on-screen element first, then fills the 300 budget with the nearest off-screen ones, then appends `(N more off-screen elements omitted; scroll to reveal them)`. — [snapshot.ts:153-165](../../src/content/snapshot.ts#L153-L165)
- Same-origin iframes and open shadow roots are walked. Cross-origin frames are skipped. — [snapshot.ts:110-123](../../src/content/snapshot.ts#L110-L123)
- Estimate: on representative synthetic lines (button, input with value, select with 3 options, long off-screen link, heading), the average line is about 47 chars, so a full 300-line snapshot is about 14k chars, or roughly 4k tokens at about 3.5 chars/token. This is synthetic, not measured on a rendered page. A worst-case `<select>` line exceeds 400 chars. — [snapshot.ts:77](../../src/content/snapshot.ts#L77)
- Measured lower bound on how much of the 300 cap the testbed uses: I fetched the static HTML of the 250 testbed challenge pages that return 200 and counted interactive tags, ARIA roles and H1–H3 by regex (JS-rendered content is not counted). Median 12, p90 99, max 5,009 (`/lab/stress/many-buttons`). Shop product and listing pages have about 162–183. Only one page exceeds 300 statically. — [testbed/challenges.ts](../../testbed/challenges.ts)

**History**
- History holds assistant messages (with raw `tool_calls`) and `tool` result messages, never snapshots. Trimming is by message count (24), not tokens, and the kept window starts at an assistant message so tool results are never orphaned. — [agent.ts:15](../../src/background/agent.ts#L15), [agent.ts:159-166](../../src/background/agent.ts#L159-L166), [agent.ts:182-188](../../src/background/agent.ts#L182-L188)
- Most tool results are short, e.g. `clicked [12] (settled 140ms)`. The exceptions are `read_text`, which returns up to 6,000 chars plus a truncation note, and `select` errors, which list up to 500 chars of options. Both stay in history until they fall out of the 24-message window. — [tools.ts:62](../../src/background/tools.ts#L62), [tools.ts:134-135](../../src/background/tools.ts#L134-L135), [snapshot.ts:201-206](../../src/content/snapshot.ts#L201-L206), [snapshot.ts:217](../../src/content/snapshot.ts#L217)

### Inferences
- Fixed per-turn input is about 1.1k tokens (system plus tools) plus about 0.3–4k tokens of snapshot plus history. A typical mid-size page (around 100 elements) probably lands at 2–3k input tokens per turn, and heavy pages hit the 300-line cap at about 5k+. Input tokens are resent every turn, so cost and prefill scale linearly with turn count.
- The message order (static system, static task, growing history, changing page last) is prefix-friendly. A provider with automatic prefix caching could reuse the system, task and early history, but FastPilot sends no cache hints, so any caching is up to the provider.
- Because the model re-derives the plan from the task plus a short history every turn, with no separate plan state, it must re-read the whole snapshot each turn to ground refs. That is the main reason the snapshot cannot simply be dropped. It can, however, be ranked or pruned (see section 6).

### Gaps
- There are no measured snapshot sizes for rendered real-world pages or the JS-rendered testbed pages. Measuring them would need a browser, which was out of scope. The side panel's **Snapshot** button shows them live ([index.ts:31-36](../../src/background/index.ts#L31-L36)).
- Token counts are not recorded anywhere: no `usage` is read from the stream ([openaiCompat.ts:53-98](../../src/background/llm/openaiCompat.ts#L53-L98)). Exact per-turn token sizes and their growth over a task therefore cannot be stated from the repo.

---

## 2. What tools does the model have, and which tool choices are really simple classifications or rankings?

### Takeaway
There are 12 tools: 8 actions, 2 reads, and the 2 terminators `done` and `handoff`. Several decisions the big model makes every turn are really low-entropy judgments that a small model or deterministic code could answer: whether the task is complete, whether a blocker or handoff condition is present, which ref matches an intent, whether an action did what was expected, which `<select>` option a value means, whether a text-only reply is a final answer, and whether a screenshot is needed. True multi-step planning and free-text answer composition are the parts that still need the big model.

### Cited Findings
- Tool list: `click(ref)`, `type(ref, text, submit?, clear?)`, `select(ref, value)`, `key(combo)`, `hover(ref)`, `scroll(direction?, pages?, ref?)`, `navigate(url | "back" | "forward")`, `wait_for(text, timeout_ms?)`, `read_text(ref?)`, `screenshot()`, `done(result)`, `handoff(reason)`. — [tools.ts:17-38](../../src/background/tools.ts#L17-L38)
- `ToolResult` carries `text`, an optional `image` (JPEG data URL shown on the next turn), `stale` (the rest of the batch was planned against a page that no longer exists) and `final` (done or handoff). — [tools.ts:42-49](../../src/background/tools.ts#L42-L49)
- The tools that trigger a settle wait are click, type, select, key, hover, scroll and navigate. — [tools.ts:51](../../src/background/tools.ts#L51)
- `type` on a `<select>` silently redirects to `select`. — [tools.ts:85](../../src/background/tools.ts#L85)
- `select` matches options by exact value, exact case-insensitive text, then substring. On a miss it errors with the option list, and the error marks the batch stale. — [snapshot.ts:209-222](../../src/content/snapshot.ts#L209-L222), [tools.ts:93-97](../../src/background/tools.ts#L93-L97), [agent.ts:125-127](../../src/background/agent.ts#L125-L127)
- `wait_for` is a case-insensitive substring match on `document.body.innerText` via MutationObserver (default 5 s, max 15 s). A timeout returns non-error text, so it neither aborts the batch nor counts as a failure in the loop. — [tools.ts:129-132](../../src/background/tools.ts#L129-L132), [snapshot.ts:224-235](../../src/content/snapshot.ts#L224-L235), [agent.ts:128](../../src/background/agent.ts#L128)
- Replay does treat a `wait_for` timeout as a failure, which is inconsistent with the loop. — [replay.ts:49](../../src/background/replay.ts#L49)
- `click` reports, but does not act on, an element covering the click point: `(warning: point was covered by …)`. — [tools.ts:72-76](../../src/background/tools.ts#L72-L76), [snapshot.ts:188-192](../../src/content/snapshot.ts#L188-L192)
- `screenshot` captures a JPEG (q70), downscales it to ≤1280 px wide and re-encodes it at q0.6. The image only reaches the model on the next turn. — [tools.ts:137-138](../../src/background/tools.ts#L137-L138), [tools.ts:151-163](../../src/background/tools.ts#L151-L163), [agent.ts:100-102](../../src/background/agent.ts#L100-L102), [agent.ts:166](../../src/background/agent.ts#L166)
- `done` and `handoff` are the only ways to finish cleanly. Handoff conditions are spelled out in both the system prompt and the tool description (CAPTCHA, login/password, 2FA, payment/purchase confirmation, "anything needing their judgment"). — [agent.ts:26](../../src/background/agent.ts#L26), [tools.ts:36-37](../../src/background/tools.ts#L36-L37)
- Testbed workload (counted by importing the challenge registry): 279 challenges, of which 235 are "supported today". By check type: 202 `auto`, 68 `answer`, 9 `handoff`. By capability needed: click 209, type 146, read 61, wait 24, scroll 23, select 22, key 22, screenshot 11, hover 7, handoff 9. The `lab:adversarial` area has 13 challenges, including text, hidden and aria-label prompt injections, a fake API-key dialog, an urgency "Buy now" countdown, and password, CAPTCHA, SMS-code and payment gates. — [testbed/challenges.ts:6-50](../../testbed/challenges.ts#L6-L50)

**Decisions embedded in tool choice that are classification or ranking shaped**

| Decision the big model makes today | Where it shows up | Shape |
|---|---|---|
| "Is the task complete?" (and "what is the answer?") | `done(result)` call; post-replay check turn ([agent.ts:82](../../src/background/agent.ts#L82)) | binary plus probability; extraction for answer-type tasks |
| "Is there a CAPTCHA, login, 2FA, payment or injection trap I must hand off on?" | `handoff(reason)` ([tools.ts:37](../../src/background/tools.ts#L37)) | multi-class page-state label |
| "Which element matches 'Add to cart' for the green mug?" | every `ref` argument ([tools.ts:15](../../src/background/tools.ts#L15)) | ranking over snapshot candidates |
| "Is this action safe or irreversible?" (e.g. Pay now, Delete all data) | implicit in whether to call `click` vs `handoff` | binary risk label per action |
| "Did the last action do what I expected (modal opened, validation error, nothing happened)?" | the model re-reads the next snapshot | binary or multi-class over a before/after diff |
| "Which `<select>` option does 'Medium' mean?" | a `select` miss → error → re-plan turn ([snapshot.ts:217](../../src/content/snapshot.ts#L217)) | ranking over options |
| "Do I need eyes for this?" | `screenshot()` call | binary |
| "Is my text-only reply the final answer or just narration or a question?" | text-only reply ends the run ([agent.ts:154-157](../../src/background/agent.ts#L154-L157)) | multi-class over the reply text |

### Inferences
- In the 202 `auto` testbed challenges, "is the task complete?" has an observable answer on the page (a success banner, count or state change). A completion judgment over the post-action snapshot is a good fit there. For the 68 `answer` challenges, completion also needs answer extraction, which is a bigger ask of a small model but still bounded (a short value from page text).
- The 9 `handoff` challenges and the 13 adversarial ones are exactly the cases where a fast, always-on page-state and action-risk classifier adds reliability. Today safety depends on the big model following two sentences of instructions while it reads injected page text.
- Grounding (choosing a ref) is the most frequent decision: about 209 of 279 challenges need click and 146 need type. It is only worth moving to a small ranker if the big model stops receiving the full snapshot. Otherwise the big model has already done the ranking implicitly.

### Gaps
- The repo has no data on how often the big model gets these micro-decisions wrong (wrong ref, premature done, missed handoff). The testbed scoreboard would produce that, but no results are recorded.

---

## 3. Where is wall-clock time spent per turn, and what telemetry exists?

### Takeaway
Critical path per turn ≈ **snapshot** + **model time-to-first-token** + **max(remaining stream time, all but the last action)** + **last action and its settle**. Model time is not measured in the repo, but every deterministic part has hard-coded floors. In `fast` mode a click costs at least about 185–285 ms of scripted motion and settle before any IPC, every settling action pays at least 100 ms of quiet-window wait, and settle can reach 2.5 s per action (12.5 s with page loads). Telemetry is already emitted per step (snapshot ms, model ms, first-token ms) and per action (ms), but only to the side panel log; nothing is persisted or aggregated.

### Cited Findings

**Existing telemetry**
- Per step, the loop logs `<count> elements in <snapMs>ms · model <modelMs>ms (first token <firstTokenMs>ms)`. — [agent.ts:92-94](../../src/background/agent.ts#L92-L94), [agent.ts:138-150](../../src/background/agent.ts#L138-L150)
- Per action, it logs result text with the action's elapsed ms, and the settle time is appended to the result text as `(settled Nms)`, which the model sees as well. — [agent.ts:116](../../src/background/agent.ts#L116), [agent.ts:129](../../src/background/agent.ts#L129), [tools.ts:62](../../src/background/tools.ts#L62)
- On completion, the loop logs total task ms. Replay logs its own duration. — [agent.ts:155](../../src/background/agent.ts#L155), [agent.ts:169](../../src/background/agent.ts#L169), [agent.ts:78](../../src/background/agent.ts#L78)
- The side panel renders `ms` per log row (as `1.2s` once it reaches 1000 ms). Nothing is persisted. — [sidepanel/main.ts:26-30](../../src/sidepanel/main.ts#L26-L30), [shared/types.ts:40-44](../../src/shared/types.ts#L40-L44)
- `firstTokenMs` is set on the first SSE chunk that contains any `delta`, measured from before `fetch`. — [openaiCompat.ts:16](../../src/background/llm/openaiCompat.ts#L16), [openaiCompat.ts:79-81](../../src/background/llm/openaiCompat.ts#L79-L81)
- In the non-streaming fallback, `firstTokenMs` equals the full response time. — [openaiCompat.ts:39-47](../../src/background/llm/openaiCompat.ts#L39-L47)

**Snapshot cost**
- `snapshotPage` runs `querySelectorAll('*')` over the document, each open shadow root and each same-origin iframe. It calls `el.matches(SEL)` and `closest()` per element, and `getComputedStyle` plus `getBoundingClientRect` per candidate, so cost grows with total DOM size, not just interactive elements. — [snapshot.ts:88-92](../../src/content/snapshot.ts#L88-L92), [snapshot.ts:110-150](../../src/content/snapshot.ts#L110-L150)
- `inPage` retries `executeScript` up to 3 times, waiting up to 5 s for tab `complete` plus 100 ms between tries, so a snapshot taken right after a navigation can stall. — [page.ts:21-42](../../src/background/page.ts#L21-L42)

**Model call**
- The model call is one streaming `fetch` per turn. Its time is TTFT (connection, queueing, prefill of the full prompt) plus generation of the content and tool-call JSON. — [openaiCompat.ts:15-50](../../src/background/llm/openaiCompat.ts#L15-L50)

**Action execution overlap**
- Tool call *i* is handed to the executor only when call *i+1* starts streaming. The last call is handed over only when the stream ends, so the last action and its settle are never overlapped with generation. — [openaiCompat.ts:84-89](../../src/background/llm/openaiCompat.ts#L84-L89), [openaiCompat.ts:96](../../src/background/llm/openaiCompat.ts#L96)
- The loop then awaits every queued action before the next snapshot. — [agent.ts:153](../../src/background/agent.ts#L153)

**Per-action fixed costs (from code constants)**
- Every action: `chrome.tabs.get` before and after. Every recordable action with a ref: an extra `executeScript(describeTarget)` before acting, which only serves recording. — [tools.ts:55](../../src/background/tools.ts#L55), [tools.ts:60](../../src/background/tools.ts#L60), [agent.ts:117-121](../../src/background/agent.ts#L117-L121)
- `click`: one `executeScript(locateRef)` (which may `scrollIntoView`), a mouse move of 70–150 ms in fast mode (220–600 ms in natural, 0 in instant), and a press hold of 15–35 ms in fast mode (50–110 ms natural, 0 instant). — [tools.ts:65-76](../../src/background/tools.ts#L65-L76), [humanize.ts:24-30](../../src/background/humanize.ts#L24-L30), [humanize.ts:68-70](../../src/background/humanize.ts#L68-L70), [input.ts:44-51](../../src/background/input.ts#L44-L51)
- `type`: an extra `executeScript(refTag)`, then the click path, then a clear (Meta+A plus Backspace, which is 4 CDP sends), then per character a keyDown and keyUp (2 CDP sends) plus 5–14 ms in fast mode (45–120 ms natural, with extra pauses). Instant mode uses a single `Input.insertText`. — [tools.ts:84-90](../../src/background/tools.ts#L84-L90), [input.ts:53-65](../../src/background/input.ts#L53-L65), [input.ts:83-99](../../src/background/input.ts#L83-L99), [humanize.ts:72-80](../../src/background/humanize.ts#L72-L80)
- `scroll`: a viewport `Runtime.evaluate`, then wheel ticks of 90–130 px with 8–18 ms gaps in fast mode. — [tools.ts:110-119](../../src/background/tools.ts#L110-L119), [input.ts:101-109](../../src/background/input.ts#L101-L109), [humanize.ts:83-93](../../src/background/humanize.ts#L83-L93)
- **Settle** after each settling action has three parts:
  - `waitTabComplete`, polling `chrome.tabs.get` every 50 ms for up to 10 s.
  - In parallel, `networkIdle` (polls every 20 ms; needs `quietMs` with no counted request in flight; ignores WebSocket, EventSource, Ping and Media, and any request older than 3 s) and `domQuiet` (MutationObserver quiet for `quietMs`), each capped at 2.5 s.
  - `quietMs` is 60, 100 or 200 ms for instant, fast or natural. Both waits start their quiet clock at call time, so **the floor is `quietMs` even on a completely idle page**.
  - Sources: [page.ts:11-12](../../src/background/page.ts#L11-L12), [page.ts:48-58](../../src/background/page.ts#L48-L58), [cdp.ts:6-9](../../src/background/cdp.ts#L6-L9), [cdp.ts:50-62](../../src/background/cdp.ts#L50-L62), [settle.ts:4-21](../../src/content/settle.ts#L4-L21)

**Test coverage (run 2026-10-21, Node v26.10.0)**
- `npm test` (`node --test test/*.test.ts`): 17 of 17 pass in about 0.86 s. — [package.json](../../package.json)
- `npm run typecheck` (`tsc --noEmit`): clean, no output.
- What the tests cover:
  - `humanize` path, wheel and delay invariants (4 tests). — [test/humanize.test.ts](../../test/humanize.test.ts)
  - Recording key normalization and step summary (2). — [test/recordings.test.ts](../../test/recordings.test.ts)
  - SSE parsing: tool call *i* is emitted when *i+1* starts, and stream errors surface (2). — [test/stream.test.ts](../../test/stream.test.ts)
  - Testbed server routes, answers, redirects and cart (9). — [test/testbed.test.ts](../../test/testbed.test.ts)
- Nothing covers `agent.ts` (the loop, batch abort, history trimming), `tools.ts` dispatch, `page.ts` settle or `snapshot.ts`. All of these depend on `chrome.*` APIs, and there is no fake provider or fake page harness.

### Inferences
- **Fast-mode click floor**: 70–150 ms move + 15–35 ms hold + at least 100 ms settle ≈ 185–285 ms, plus about 3 `executeScript` round trips (describeTarget, locate, domQuiet) and 2 `tabs.get` calls.
- **Fast-mode 20-character `type`**: about 0.3–0.6 s, i.e. the click cost plus clear plus 20 × (2 CDP round trips + about 10 ms) plus settle.
- **10-field form**: on the order of 3–6 s of action time. This is mostly hidden behind streaming only if the model streams for that long; otherwise it lands on the critical path after the stream ends.
- **Instant mode**: removes mouse, hold and per-key time but keeps the 60 ms settle floor and all IPC.
- **Per-turn sequencing**: snapshot → TTFT → stream with overlapped actions → last action and settle → next snapshot, strictly serial across turns. Turn count is the dominant multiplier. Each avoided turn saves a full snapshot, a full prompt prefill (about 1.5–5k tokens) and TTFT. Each avoided action saves only about 0.2–0.6 s in fast mode.
- **Settle floors in a batch**: each settle floor is paid inside the chain. In a 10-action batch on an idle page that is at least 1 s of pure quiet-window waiting in fast mode (the settle/replay researcher may cover tuning this).
- **`firstTokenMs` likely under-reports real TTFT** on providers whose first SSE chunk is a role-only delta (`{role:"assistant"}`), because any `delta` object sets it ([openaiCompat.ts:79-81](../../src/background/llm/openaiCompat.ts#L79-L81)). This is an inference about provider behavior, not verified here.

### Gaps
- There are no measured values for model TTFT, generation time, `executeScript` round trips or snapshot time on real pages. The code logs them per run, but nothing is stored, and I could not run the extension (it needs a browser and an API key). A breakdown in real seconds needs instrumented runs, e.g. persisting `LogEvent`s with `ms` and adding `usage` capture.
- Provider-specific TTFT and caching behavior (OpenRouter, Groq, Cerebras) is outside this code-only scope and not verified.

---

## 4. How are errors, retries, navigation and batch-abort handled, and where does the loop waste turns?

### Takeaway
Batch abort is coarse: any thrown error, any URL change, or any `done`/`handoff` marks the rest of the batch "skipped" and forces a full re-plan turn. Non-navigating DOM changes (modals, validation errors, re-renders, covered clicks) do **not** abort, so batches can cascade blindly. There is no retry on model API errors: a single 429 or 5xx ends the run and loses its recording. The structural turn-wasters are:
- a confirmation turn just to call `done`;
- a full turn per screenshot or `read_text`;
- a turn per `select` miss, JSON error or stale ref;
- the post-replay verification turn;
- premature termination on text-only replies.

### Cited Findings

**Batch abort**
- `skipRest` is set when arguments are invalid JSON, when a result is `stale`, or when a result is `final`. Later calls in the same reply get the result `skipped: the page changed before this action; re-plan from the new snapshot`. — [agent.ts:107-113](../../src/background/agent.ts#L107-L113), [agent.ts:134](../../src/background/agent.ts#L134)
- `stale` comes from three places:
  - a URL change after settle (`page navigated to …`), which includes hash and pushState route changes because it compares the full URL string — [tools.ts:59-61](../../src/background/tools.ts#L59-L61)
  - any exception from `runTool` (e.g. "missing ref", "ref N no longer exists (the page changed)", a `select` miss, an unknown key or modifier, an unknown tool) — [agent.ts:125-127](../../src/background/agent.ts#L125-L127), [tools.ts:65-69](../../src/background/tools.ts#L65-L69), [tools.ts:96](../../src/background/tools.ts#L96), [tools.ts:146-147](../../src/background/tools.ts#L146-L147), [input.ts:72-78](../../src/background/input.ts#L72-L78)
  - `locateRef` reporting that the element is gone — [snapshot.ts:170-172](../../src/content/snapshot.ts#L170-L172)
- Refs are tied to element identity via a WeakMap. Elements replaced by a framework re-render get new refs, and their old refs fail with "no longer exists". — [snapshot.ts:5-6](../../src/content/snapshot.ts#L5-L6), [snapshot.ts:94-99](../../src/content/snapshot.ts#L94-L99)
- A click whose point is covered by another element proceeds anyway and returns only a warning, so the batch continues. — [tools.ts:72-76](../../src/background/tools.ts#L72-L76)
- A `wait_for` timeout is not an error and does not abort. — [tools.ts:131](../../src/background/tools.ts#L131), [agent.ts:128](../../src/background/agent.ts#L128)
- The stream is **not** cancelled when `skipRest` becomes true. The model keeps generating tool calls that will all be skipped. — [agent.ts:139-148](../../src/background/agent.ts#L139-L148)

**Retries**
- **Model API**: a non-OK HTTP status throws immediately (`Model API <status>: …`), and an in-stream `error` throws. Neither is retried. The throw propagates out of `run` to the side panel. — [openaiCompat.ts:36](../../src/background/llm/openaiCompat.ts#L36), [openaiCompat.ts:78](../../src/background/llm/openaiCompat.ts#L78), [index.ts:23-26](../../src/background/index.ts#L23-L26)
- **Page script injection**: up to 3 retries across navigations. — [page.ts:30-42](../../src/background/page.ts#L30-L42)
- **Recording**: saved only when the run ends with `done`. Runs that error, hit `maxSteps` or hand off are not saved. — [agent.ts:167-171](../../src/background/agent.ts#L167-L171)

**Navigation**
- `navigate` calls `chrome.tabs.update`, `goBack` or `goForward`, then settles. It always ends the batch, because the URL changes. — [tools.ts:121-127](../../src/background/tools.ts#L121-L127), [tools.ts:59-61](../../src/background/tools.ts#L59-L61)
- Mid-batch navigation from a click is detected the same way. — [tools.ts:59-61](../../src/background/tools.ts#L59-L61)

**Termination and turn-wasting patterns**
- A reply with zero tool calls ends the task as `done`, using the reply text. Because `tool_choice` is `auto`, a model that narrates ("I'll now fill the form") or asks a question will end the run. — [openaiCompat.ts:29](../../src/background/llm/openaiCompat.ts#L29), [agent.ts:154-157](../../src/background/agent.ts#L154-L157)
- `screenshot` and `read_text` results are only visible to the model on the *next* turn (the image via `image`, text via the tool message), so each read costs one turn. — [agent.ts:100-102](../../src/background/agent.ts#L100-L102), [agent.ts:164-166](../../src/background/agent.ts#L164-L166)
- The system prompt asks the model to batch only when it "can predict the outcome". Batched `done` after a submit is skipped if the submit navigates (stale), so confirming success needs another turn. — [agent.ts:22](../../src/background/agent.ts#L22), [agent.ts:134](../../src/background/agent.ts#L134)
- After a replay, a full LLM turn always runs to verify completion and/or answer. — [agent.ts:80-82](../../src/background/agent.ts#L80-L82)
- The hard cap is `maxSteps` (default 40). — [agent.ts:89](../../src/background/agent.ts#L89), [shared/types.ts:18](../../src/shared/types.ts#L18)

### Inferences
- Most successful tasks probably pay at least one "look at the result, then call done" turn. That turn is pure verification (and, for answer tasks, extraction) over a snapshot. It is the single most replaceable LLM call.
- Blind cascades are a reliability risk. Example: a modal or cookie banner appears after action 2 of 6; actions 3–6 click "through" it (getting only a covered warning) or type into the wrong field. The model then needs one or more recovery turns. A cheap post-action check (snapshot diff plus a judgment such as "did a blocking dialog or validation error appear?") would set `skipRest` earlier.
- Cancelling the stream when `skipRest` flips would save generation time for calls that are guaranteed to be skipped. This needs no model: abort a per-call `AbortController` linked to the run signal. Today the run-wide `this.abort` is passed straight to `chat`, so aborting it would stop the whole run ([agent.ts:31](../../src/background/agent.ts#L31), [agent.ts:64](../../src/background/agent.ts#L64), [agent.ts:142](../../src/background/agent.ts#L142)).
- Having no LLM retry means one transient 429 or 5xx on turn 15 of a 16-turn task discards all progress and the recording. A small retry with backoff in `OpenAICompatProvider.chat` is a deterministic fix.
- The `wait_for` inconsistency (success in the loop, failure in replay) means a recorded run can contain a step that always fails on replay if it timed out during the original run.

### Gaps
- There is no empirical frequency for each waste pattern (confirmation turns, stale refs, select misses, text-only exits). Getting it would need instrumented testbed runs.

---

## 5. What does streaming execution imply for a hybrid design (small model for micro-decisions, big model for planning)?

### Takeaway
The `onToolCall` callback and the sequential promise chain already form a "decide → act while the planner keeps talking" pipeline. A small-model judgment inserted per tool call (before or after the action) is hidden behind the big model's streaming, except on the last action of each batch. Judgments that run in parallel with the big-model call (completion check, page blocker) can short-circuit the turn by aborting the stream. The architecture suits hybrid insertion. The main refactors needed are a per-call abort controller and structured (not text-only) snapshot items.

### Cited Findings
- `ChatRequest.onToolCall` "fires as soon as each tool call has fully streamed, before the response ends". The provider interface is a single `chat(req)` method. — [llm/types.ts:19-35](../../src/background/llm/types.ts#L19-L35)
- The agent turns each callback into `chain = chain.then(() => exec(call))`, so actions run strictly in order and overlap with the rest of the stream. — [agent.ts:104-107](../../src/background/agent.ts#L104-L107), [agent.ts:143-147](../../src/background/agent.ts#L143-L147)
- The stream test pins the exact emission timing: `type` is emitted with full args when the `click` call starts, and `click` at stream end. — [test/stream.test.ts:18-33](../../test/stream.test.ts#L18-L33)
- `exec` already has the hook points:
  - a pre-action skip check — [agent.ts:109](../../src/background/agent.ts#L109)
  - a pre-action `describeTarget` round trip — [agent.ts:117-121](../../src/background/agent.ts#L117-L121)
  - the action — [agent.ts:124](../../src/background/agent.ts#L124)
  - a post-action failure check and `skipRest` decision — [agent.ts:128](../../src/background/agent.ts#L128), [agent.ts:134](../../src/background/agent.ts#L134)
- When the server ignores `stream: true`, all tool calls are emitted only after the full JSON response, so there is no overlap. — [openaiCompat.ts:38-47](../../src/background/llm/openaiCompat.ts#L38-L47)
- The snapshot returns only `{text, count}`. Per-ref metadata (`tag`, `role`, `label`) lives in page memory (`window.__fp.meta`), not in the background. — [snapshot.ts:22](../../src/content/snapshot.ts#L22), [snapshot.ts:147](../../src/content/snapshot.ts#L147), [snapshot.ts:166](../../src/content/snapshot.ts#L166)

### Inferences
- **Pre-action guard (per tool call)**: a judgment like "is clicking `[42] button "Pay now"` on this page safe for this task?" can run when call *i* is emitted. It runs concurrently with the model streaming call *i+1*, and behind earlier actions in the chain if it is started outside the chain. Its latency is hidden unless it is the last call or slower than the stream. On `needs_user`, it returns a synthetic `final: {status: 'handoff'}` result, which already stops the batch ([agent.ts:134](../../src/background/agent.ts#L134), [agent.ts:167-171](../../src/background/agent.ts#L167-L171)).
- **Post-action expectation check**: a judgment over a cheap before/after diff (new dialog, alert or error text, unchanged page) sits inside the chain and adds latency per action. To stay net-positive it should run only when a deterministic diff shows something notable, such as a new `role=dialog`, new text containing "error" or "required", or no DOM change at all.
- **Speculative parallel judgments per turn**: start `taskComplete(task, snapshot)` and `pageBlocker(snapshot)` at the same time as `provider.chat`. If either returns a high-confidence terminal answer, abort only that call's stream and finish. This adds no latency when it does not fire and saves the rest of the turn when it does. It needs a per-call `AbortController` (see section 4).
- **Planner/actor split**: the cleanest version has the big model emit intent-level calls (e.g. `click({target: "Add to cart for Forest Green mug"})`) and has a small ranker resolve them to refs. The big model could then receive a compressed snapshot (headings plus top-K relevant elements), cutting prefill. This changes the tool schema and adds a ranking hop per action. It is only worthwhile if the ranker is fast (tens of ms) and accurate, and it works best with a fallback (low confidence → return candidates to the big model).
- Because both `exec` and the replay path go through `runTool` ([replay.ts:45](../../src/background/replay.ts#L45)), guards placed in `runTool` would cover replays too. Guards placed in `exec` cover only model-driven actions.

### Gaps
- The latency of a small typed-judgment call (network plus inference) is not known from this codebase. Whether a per-action check is a net win depends on it. The TypeSafe researcher should supply typical latencies.

---

## 6. Which decision points could become fast typed judgments, or be removed? (ranked)

### Takeaway
The highest-value change is a **completion/verification judgment**. It removes the always-present post-replay LLM call and, in many tasks, the final "confirm then done" turn. Next come **snapshot relevance ranking** (fewer input tokens every turn), a **page-state and action-risk safety gate** (reliability on handoff and injection cases, latency hidden behind streaming), and a **post-action expectation check** (stops blind cascades). Several waste points need no model at all: abort the stream on stale, retry model errors, take `describeTarget` off the critical path, and use `tool_choice: 'required'` or a reply classifier.

### Cited Findings
These are the decision points located in the code (see sections 1–5 for detail):
- Post-replay verify turn — [agent.ts:80-82](../../src/background/agent.ts#L80-L82)
- `done` decision — [tools.ts:36](../../src/background/tools.ts#L36), [agent.ts:167-170](../../src/background/agent.ts#L167-L170)
- `handoff` decision — [tools.ts:37](../../src/background/tools.ts#L37), [agent.ts:26](../../src/background/agent.ts#L26)
- Ref grounding over the full snapshot — [tools.ts:15](../../src/background/tools.ts#L15), [snapshot.ts:153-166](../../src/content/snapshot.ts#L153-L166)
- Covered-click warning ignored — [tools.ts:75](../../src/background/tools.ts#L75)
- `select` miss → error turn — [snapshot.ts:213-217](../../src/content/snapshot.ts#L213-L217)
- Text-only reply → run ends — [agent.ts:154-157](../../src/background/agent.ts#L154-L157)
- `read_text` up to 6,000 chars into history — [tools.ts:134-135](../../src/background/tools.ts#L134-L135)
- Screenshot costs a turn — [agent.ts:100-102](../../src/background/agent.ts#L100-L102)
- Exact-text replay key — [recordings.ts:26-32](../../src/shared/recordings.ts#L26-L32)
- No stream cancel on stale — [agent.ts:139-148](../../src/background/agent.ts#L139-L148)
- No model retry — [openaiCompat.ts:36](../../src/background/llm/openaiCompat.ts#L36)
- `describeTarget` on the critical path — [agent.ts:117-121](../../src/background/agent.ts#L117-L121)

### Inferences: ranked list

The effects below are estimates derived from the code structure. None has been measured.

| Rank | Decision point (code) | Replace with | Expected speed / cost / reliability effect | Main risk and mitigation |
|---|---|---|---|---|
| 1 | **Task-complete check**: post-replay verify turn ([agent.ts:80-82](../../src/background/agent.ts#L80-L82)) and the "confirm then `done`" turn | Typed judgment `taskComplete` over `{task, snapshot, recentActions}` → `{complete: bool, p}`. For answer-type tasks, add an extraction judgment → `{answer: string, p}`. Run it speculatively in parallel with the big-model call; abort the stream on high p. | **Speed**: removes 1 full big-model turn (snapshot, prefill, TTFT, generation) on many tasks. Replays become LLM-free when p is high. **Cost**: saves one full-context call per task. **Reliability**: neutral to positive if thresholded. | A false "complete" reports success wrongly. Use a high threshold, fall back to the big model when unsure, and restrict auto-finish to `auto`-style tasks (no answer requested) at first. |
| 2 | **Snapshot relevance ranking/pruning** at [agent.ts:93-95](../../src/background/agent.ts#L93-L95) / [page.ts:44-46](../../src/background/page.ts#L44-L46) | Ranking judgment over `{task, lastStepSummary, items[]}` → `[{ref, p}]`. Send the big model headings, focused and form controls, and the top-K items, plus a "N more; call expand()" line. | **Speed and cost**: cuts snapshot tokens (about 4k → about 1k at the 300 cap; less on small pages, where median static count is about 12) on *every* turn; TTFT drops if prefill-bound. **Reliability**: can improve focus on cluttered pages (e.g. `/lab/stress/look-alikes`, 209 static elements). | Pruning out the needed element costs an extra turn. Always keep on-screen form controls, add an `expand` or `snapshot(full)` tool, and skip pruning below about 80 items. |
| 3 | **Page-state blocker / handoff classifier** (implicit `handoff` decision, [tools.ts:37](../../src/background/tools.ts#L37)) | Classification over `{task, snapshot header + lines}` → `'none' \| 'captcha' \| 'login' \| 'two_factor' \| 'payment_confirm' \| 'cookie_banner' \| 'blocking_modal' \| 'prompt_injection'` with p. Run in parallel with the snapshot and LLM call. | **Reliability**: an always-on safety net for the 9 handoff and 13 adversarial testbed cases. **Speed**: immediate handoff without waiting for the big model, and cookie banners can be auto-dismissed deterministically (saving a recovery turn). | False-positive handoffs stop good runs. Act only on high p; otherwise inject the label as a hint line in the page message. |
| 4 | **Pre-action risk gate** (on each `onToolCall`, [agent.ts:143-147](../../src/background/agent.ts#L143-L147) / `exec` [agent.ts:108](../../src/background/agent.ts#L108)) | Classification over `{task, action, targetLine, pageTitle/url}` → `'safe' \| 'irreversible_needs_user' \| 'off_task'` with p. On non-safe, return `final: handoff` or `stale`. | **Reliability**: blocks "Pay now", "Delete all data" and injection-driven clicks even when the big model was fooled. **Speed**: latency hidden behind streaming except on the last call; skip for read-only tools. | Adds latency to the last action. Call it only for click, type with `submit`, and key Enter on buttons or links whose labels match a risk lexicon (deterministic pre-filter). |
| 5 | **Post-action expectation check** (inside `exec`, after [agent.ts:124](../../src/background/agent.ts#L124)) | A deterministic before/after diff first (new dialog, alert, error text, no change). If something is notable, judgment over `{action, diff}` → `'as_expected' \| 'blocked_by_overlay' \| 'validation_error' \| 'no_effect'`, which sets `skipRest`. | **Reliability**: stops blind cascades into modals and validation errors. **Turns**: fewer recovery turns. **Cost**: small. | Adds a diff `executeScript` per action. Gate it on the existing `covered` warning ([tools.ts:75](../../src/background/tools.ts#L75)) and on DOM-mutation counts from `domQuiet`. |
| 6 | **Text-only reply → end** ([agent.ts:154-157](../../src/background/agent.ts#L154-L157)) | Remove it by sending `tool_choice: 'required'` (deterministic; `done` exists), or classify the reply → `'final_answer' \| 'question_for_user' \| 'narration'`. | **Reliability**: no premature "Finished." exits. **Speed**: neutral. | Some OpenAI-compatible servers may not support `required` (not verified). The classifier is the fallback. |
| 7 | **`select` option matching** ([snapshot.ts:213-217](../../src/content/snapshot.ts#L213-L217)) | Ranking over `{value, options[]}` → `{option, p}` when exact and substring matching fail. | **Turns**: saves one error/re-plan turn per miss (e.g. "Medium" vs "M", "USA" vs "United States"). | Picking the wrong option silently. Require high p, otherwise keep the current error. |
| 8 | **`read_text` extraction** ([tools.ts:134-135](../../src/background/tools.ts#L134-L135)) | Add an optional `question` arg; an extraction judgment returns `{value, p, snippet}` instead of up to 6,000 chars. | **Cost**: shrinks history for the 61 read-type testbed challenges; less prefill on later turns. **Reliability**: decoy answers (`reject` lists in the testbed) are a risk. | Wrong extraction. Return the snippet alongside the value so the big model can still check it. |
| 9 | **Per-turn model routing** (seam: `LLMProvider`, [llm/types.ts:33-35](../../src/background/llm/types.ts#L33-L35); constructor [agent.ts:35](../../src/background/agent.ts#L35)) | A routing judgment over `{task, lastResults, pageState}` → `'routine' \| 'needs_planning'` chooses a fast small chat model or the stronger one per turn. | **Speed and cost**: routine continuation turns on cheaper, faster models. | Misrouting hard turns. Escalate after any error or stale result. |
| 10 | **Screenshot need** ([tools.ts:35](../../src/background/tools.ts#L35), [agent.ts:166](../../src/background/agent.ts#L166)) | Classification over `{task, snapshot}` → `needsVision: bool`. When true, attach a screenshot proactively on the same turn. | **Turns**: saves one turn on the 11 screenshot or visual testbed tasks. | Image tokens on turns that did not need them. Use a threshold. |
| 11 | **Replay task matching** ([agent.ts:73](../../src/background/agent.ts#L73), [recordings.ts:26-32](../../src/shared/recordings.ts#L26-L32)) | `sameTask` / slot-extraction judgment `{savedTask, newTask}` → `{same: bool, slots}` to reuse parameterized runs ("blue mug" vs "red mug"). | **Speed**: more tasks hit the near-zero-LLM replay path. | Wrong reuse. Covered in more depth by the replay researcher. |

**Remove or fix deterministically (no model needed)**
- **R1**: Cancel the stream when `skipRest` flips. This needs a per-call `AbortController` linked to the run signal ([agent.ts:31](../../src/background/agent.ts#L31), [agent.ts:142](../../src/background/agent.ts#L142)) and saves generation of calls that are guaranteed to be skipped.
- **R2**: Retry 429, 5xx and network errors with backoff in `OpenAICompatProvider.chat` ([openaiCompat.ts:36](../../src/background/llm/openaiCompat.ts#L36)). This keeps a transient error from wiping out a long run.
- **R3**: Take `describeTarget` off the action critical path ([agent.ts:117-121](../../src/background/agent.ts#L117-L121)), for example by fingerprinting all refs once per snapshot inside `snapshotPage` (meta is already built at [snapshot.ts:147](../../src/content/snapshot.ts#L147)).
- **R4**: Capture `usage` and persist per-step timings (snapMs, firstTokenMs, modelMs, per-action ms), so any hybrid change can be measured.
- **R5**: Make `wait_for` timeouts consistent between the loop and replay ([agent.ts:128](../../src/background/agent.ts#L128) vs [replay.ts:49](../../src/background/replay.ts#L49)).

### Gaps
- None of the expected effects can be quantified without baseline telemetry (turns per task, share of confirmation turns, TTFT vs prompt size) and the small model's latency and accuracy. Both are missing from the repo. The testbed (279 challenges, auto-scored) is the natural benchmark, but it has no recorded runs.

---

## 7. Proposed integration seams: function names, interfaces, and input/output types

### Takeaway
Six code seams cover every proposal:
- after `snapshot()` and before or alongside `provider.chat()` in `Agent.run`;
- the `onToolCall` → `exec` chain;
- `runTool`;
- `LLMProvider`;
- `snapshotPage`'s return type;
- the replay entry in `Agent.run`.

A single `Judge` interface injected into `Agent` (next to `provider`) keeps all of these swappable, testable with a fake, and off by default.

### Cited Findings (existing seams)
- `Agent` holds `provider: LLMProvider` and builds it in the constructor. A second injected dependency fits beside it. — [agent.ts:30-36](../../src/background/agent.ts#L30-L36)
- After the snapshot and before the model call, `snap`, `task`, `note` and `history` are all in scope. — [agent.ts:93-101](../../src/background/agent.ts#L93-L101)
- `onToolCall` → `exec(call)` holds `call.name`, the parsed `args` and `dbg`, and it can return a synthetic `ToolResult` (with `final` or `stale`) to stop the batch. — [agent.ts:108-136](../../src/background/agent.ts#L108-L136)
- `runTool(ctx, name, args)` is shared by the loop and replay. — [tools.ts:53-63](../../src/background/tools.ts#L53-L63), [replay.ts:45](../../src/background/replay.ts#L45)
- `LLMProvider.chat(req)` is the only model interface. — [llm/types.ts:33-35](../../src/background/llm/types.ts#L33-L35)
- `snapshotPage(maxItems)` returns `{text, count}`. Per-ref `{tag, role, label}` is computed but kept in page memory. — [snapshot.ts:22](../../src/content/snapshot.ts#L22), [snapshot.ts:147](../../src/content/snapshot.ts#L147), [snapshot.ts:166](../../src/content/snapshot.ts#L166)
- The replay entry and post-replay note are built at [agent.ts:73-83](../../src/background/agent.ts#L73-L83).
- `Settings` is the natural place to put feature flags. — [shared/types.ts:3-11](../../src/shared/types.ts#L3-L11)

### Inferences: proposed shapes

The proposed types below are a design sketch, not TypeSafe's actual API contract. The TypeSafe researcher should map them to real primitives.

```ts
// src/background/judge/types.ts (proposed)
export interface Judged<T> { value: T; p: number; ms: number }

export interface SnapItem {            // new structured return from snapshotPage
  ref: number; kind: string; label: string; extras: string;
  pos: '' | 'above' | 'below'; dist: number; isHeading: boolean;
}
export interface PageView { url: string; title: string; items: SnapItem[]; text: string }

export interface Judge {
  /** Rank 1: speculative, in parallel with provider.chat; also replaces the post-replay verify turn. */
  taskComplete(i: { task: string; page: PageView; recentActions: string[] }): Promise<Judged<boolean>>;
  extractAnswer?(i: { task: string; pageText: string }): Promise<Judged<string>>;
  /** Rank 2: prune the snapshot sent to the big model. */
  rankElements(i: { task: string; subgoal?: string; items: SnapItem[] }): Promise<{ ref: number; p: number }[]>;
  /** Rank 3: page-level blocker / handoff. */
  pageState(i: { task: string; page: PageView }): Promise<Judged<
    'none' | 'captcha' | 'login' | 'two_factor' | 'payment_confirm' | 'cookie_banner' | 'blocking_modal' | 'prompt_injection'>>;
  /** Rank 4: per tool call, before execution. */
  actionRisk(i: { task: string; tool: string; args: unknown; target?: SnapItem; url: string }): Promise<Judged<
    'safe' | 'irreversible_needs_user' | 'off_task'>>;
  /** Rank 5: per action, only when a deterministic diff is notable. */
  actionOutcome(i: { tool: string; target?: SnapItem; diff: { added: string[]; removed: string[]; urlChanged: boolean } }): Promise<Judged<
    'as_expected' | 'blocked_by_overlay' | 'validation_error' | 'no_effect'>>;
  /** Rank 6 fallback. */
  replyKind(i: { task: string; reply: string }): Promise<Judged<'final_answer' | 'question_for_user' | 'narration'>>;
  /** Rank 7. */
  pickOption(i: { want: string; options: string[] }): Promise<Judged<number>>;
  /** Rank 9. */
  route(i: { task: string; step: number; lastResults: string[]; pageState?: string }): Promise<Judged<'routine' | 'needs_planning'>>;
}
```

Where each hook goes:

1. **`Agent.run`, after the snapshot at [agent.ts:93](../../src/background/agent.ts#L93)**: start `pageState` and `taskComplete` (skip `taskComplete` on step 1 when there was no replay) concurrently with `provider.chat` at [agent.ts:139](../../src/background/agent.ts#L139). Use a per-call `AbortController` whose signal is linked to `this.abort.signal`. On a confident terminal judgment, abort that call and emit `done` or `handoff` through the same path as [agent.ts:167-171](../../src/background/agent.ts#L167-L171).
2. **Snapshot pruning between [agent.ts:93](../../src/background/agent.ts#L93) and [agent.ts:95](../../src/background/agent.ts#L95)**: build `pageMsg` from `rankElements` output instead of `snap.text`. This needs `snapshotPage` to return `items` ([snapshot.ts:166](../../src/content/snapshot.ts#L166)) and an optional `expand` tool in `TOOLS` ([tools.ts:17-38](../../src/background/tools.ts#L17-L38)).
3. **`exec` at [agent.ts:115-124](../../src/background/agent.ts#L115-L124)**: before `runTool`, call `actionRisk` for risky tools and return `{text: 'handed off', final: {status: 'handoff', …}}` on `irreversible_needs_user`. After `runTool`, compute the diff and, if notable, call `actionOutcome`; set `result.stale = true` on anything but `as_expected`. Placing the risk gate in `runTool` instead would also cover replay ([replay.ts:45](../../src/background/replay.ts#L45)).
4. **Termination at [agent.ts:154-157](../../src/background/agent.ts#L154-L157)**: either change `tool_choice` at [openaiCompat.ts:29](../../src/background/llm/openaiCompat.ts#L29), or call `replyKind` and continue the loop on `narration`.
5. **Replay at [agent.ts:76-83](../../src/background/agent.ts#L76-L83)**: after a successful replay, call `taskComplete` (plus `extractAnswer` if the task asks a question). If confident, emit `done` and `remember` without entering the LLM loop.
6. **`setSelect` fallback at [tools.ts:93-97](../../src/background/tools.ts#L93-L97)**: on an `error: no option` result, call `pickOption` with the options and retry `setSelect` with the chosen text.
7. **Routing at [agent.ts:35](../../src/background/agent.ts#L35)**: replace the single provider with `{fast: LLMProvider, strong: LLMProvider}` and choose per turn using `route`.
8. **Flags in `Settings` ([shared/types.ts:3-11](../../src/shared/types.ts#L3-L11))**: e.g. `judge: { enabled, completion, prune, safety, outcome }`, each with a `pThreshold`. Default off, so baseline behavior is unchanged and A/B runs on the testbed are possible.

**Testability**: a `FakeJudge` and a fake `LLMProvider` (the existing `parseStream` test already builds SSE streams; [test/stream.test.ts:5-16](../../test/stream.test.ts#L5-L16)) would allow unit-testing loop changes without Chrome. The loop has no tests today ([test/](../../test/)).

### Gaps
- The exact TypeSafe/Jev request and response shapes, latency, batching and confidence semantics are not covered here (assigned to the TypeSafe researcher). The proposed `Judge` methods need to be mapped onto real primitives (e.g. which are classification vs ranking vs extraction) and checked against TypeSafe's input-size limits, since a 300-line snapshot is about 14k chars.
- Whether a small typed judgment over a raw snapshot reaches usable accuracy on completion, blocker detection and ranking is unknown and needs evaluation on the testbed.
