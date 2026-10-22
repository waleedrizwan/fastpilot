# FastPilot deterministic heuristics (replay, recordings, fingerprints, snapshot, settle, input) and the Gauntlet testbed, for a TypeSafe/Jev redesign

Scope: everything outside the main agent loop and LLM adapter, except where agent.ts creates, saves or verifies recordings. All code links are relative to the repo root (the project folder). The TypeSafe terms used below (Choice, Noul, Score, state, instructions, criteria, confidence, speculative fan-out) come from the [TypeSafe agent skill](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md). I did not research TypeSafe beyond that.

**Empirical method (used in several sections).** I wrote two throwaway scripts in the session scratchpad (`measure.mjs` and `exp.mjs`, kept outside the repo and not saved). They started the testbed in-process on ephemeral ports (`start({port:0, otherPort:0, persist:false})`, so nothing was written to `testbed/.data`) and launched headless Google Chrome at 1280x800. Over raw CDP they ran the project's own `snapshotPage`, `describeTarget`, `resolveTarget` and `domQuiet` functions (types stripped with Node's `stripTypeScriptTypes`) on every challenge start page. They also re-implemented `TabDebugger.networkIdle` (same ignored request types, same 3 s stale rule, same 20 ms poll) and `page.ts` `settle()` with the "fast" values: 100 ms quiet, 2.5 s cap and a 10 s wait for load. Caveats: the scripts used `Runtime.evaluate` in the main world, not `chrome.scripting.executeScript` in an isolated world, and synthetic `el.click()` rather than CDP mouse input. Their results are labelled "measured" below.

## Q1. Replay and recordings: keying, storage, matching, replay, verification, repair; what fails; what parameterized replay needs; where judgments fit

### Takeaway
A saved run is a flat list of literal tool calls, keyed by `origin|normalized task text`, so any change in wording or values misses the cache. On replay, each element is found again by exact label equality plus a selector that was unique at recording time, and finally by position among elements with the same label. A step counts as successful if the tool call doesn't return an error. In measured tests, a re-render, an inserted row or an inserted card made replay click the **wrong element with no error** (including a destructive "Delete"). Delayed content and already-dismissed banners make it fail after a 2.5 s wait. Parameterized replay needs a new data model (slots bound to args and to target labels), a routing and extraction judgment at lookup time, and an element re-identification judgment for value-bearing targets. That judgment should run only when the deterministic matcher is ambiguous or finds nothing.

### Cited Findings

**Data model and keying**
- `RecordedStep` is `{tool, args (without ref), target?}` — [recordings.ts:6-11](../../src/shared/recordings.ts#L6-L11). `Recording` is `{key, origin, task, steps, createdAt, lastUsedAt, uses}` — [recordings.ts:13-21](../../src/shared/recordings.ts#L13-L21). It has no start URL, no per-step URL or page signature, no expected post-condition, no success or failure counts, no version history and no parameter schema.
- Only `click, type, select, key, hover, scroll, navigate, wait_for` are recorded. Reads (`read_text`, `screenshot`) are not — [recordings.ts:23-24](../../src/shared/recordings.ts#L23-L24). For "answer" tasks, the replay therefore can't produce the answer, and the model has to read the page again.
- The key is `${origin}|${normalizeTask(task)}` — [recordings.ts:30-32](../../src/shared/recordings.ts#L30-L32). Normalization only lowercases, collapses whitespace, trims, and strips trailing `.!?` — [recordings.ts:26-28](../../src/shared/recordings.ts#L26-L28). The unit test checks exactly this and nothing semantic — [recordings.test.ts:5-10](../../test/recordings.test.ts#L5-L10). The README says replay "keys on the exact task text. 'Order a blue mug' and 'Order a red mug' are separate runs" — [README.md:21](../../README.md#L21).
- Lookup is a single exact-key hit — [recordings.ts:43-45](../../src/shared/recordings.ts#L43-L45). The origin comes from the active tab's URL when the run starts — [agent.ts:66](../../src/background/agent.ts#L66). The starting path is not part of the key, so the same task started from another page on the same site replays steps that may not apply there.
- Storage is a single `recordings` object in `chrome.storage.local`. Every lookup reads the whole map and every save does a read-modify-write of the whole map. There is no cap or eviction — [recordings.ts:34-51](../../src/shared/recordings.ts#L34-L51).
- Values are baked into the args. The recorder strips only `ref` and stores the rest verbatim (`text`, `value`, `url`, `combo`, `direction`) — [agent.ts:130-133](../../src/background/agent.ts#L130-L133), [recordings.ts:59-65](../../src/shared/recordings.ts#L59-L65).

**Recording creation (in agent.ts)**
- The element fingerprint is taken *before* acting, through `describeTarget` on the ref the model used — [agent.ts:117-121](../../src/background/agent.ts#L117-L121).
- A step is recorded if its result text doesn't start with `"error"` — [agent.ts:128-133](../../src/background/agent.ts#L128-L133). A `wait_for` timeout returns `timed out waiting for …` — [tools.ts:129-131](../../src/background/tools.ts#L129-L131). It is therefore *recorded* as a success, but replay treats it as a failure — [replay.ts:49](../../src/background/replay.ts#L49). A recording containing such a step fails at that step on every replay.
- Every successful recordable action is kept: detours, mis-clicks the model later corrected, exploratory scrolls and hovers. There is no pruning step.
- The run is saved only when the model ends with `done` — [agent.ts:167-171](../../src/background/agent.ts#L167-L171). That is the model's own claim, and nothing checks success independently before saving.
- `remember()` only increments `uses` if replay finished every step *and* the model added no recordable actions. Otherwise it overwrites the recording with `done-steps + new model steps`, keeping `createdAt` — [agent.ts:43-55](../../src/background/agent.ts#L43-L55). Repair therefore replaces the whole tail. It doesn't patch a single step, and it keeps no failure reason or version.
- Consequence for silent misfires: if a replay clicks the wrong element without error and the model then fixes it, the saved run becomes `[wrong click, corrective click]`. Both are replayed next time, and the corrective click is also positional (see the fingerprint findings below).

**Replay loop**
- Steps run strictly in order — [replay.ts:31-53](../../src/background/replay.ts#L31-L53). For a step with a target, `find()` polls a **full `snapshotPage` plus `resolveTarget`** (two injected-script round trips) every 150 ms for up to `FIND_TIMEOUT_MS = 2500` — [replay.ts:11-12](../../src/background/replay.ts#L11-L12), [replay.ts:19-27](../../src/background/replay.ts#L19-L27). This happens even when the element is already present on the first poll.
- If the element isn't found, the result is `failure: 'element not found on the page'` — [replay.ts:39](../../src/background/replay.ts#L39). The action runs through the same `runTool` as model actions, including settle — [replay.ts:45](../../src/background/replay.ts#L45), [tools.ts:53-63](../../src/background/tools.ts#L53-L63). It also uses the user's speed setting, so replay moves the mouse and types at human-like pace — [agent.ts:76](../../src/background/agent.ts#L76).
- The success test is purely lexical: `!text.startsWith('error') && !(wait_for && 'timed out')` — [replay.ts:49](../../src/background/replay.ts#L49). For example, the click "covered by another element" warning is appended to a normal result — [tools.ts:72-76](../../src/background/tools.ts#L72-L76), [snapshot.ts:189-193](../../src/content/snapshot.ts#L189-L193). It doesn't start with "error", so a click that hit a modal backdrop counts as success.
- The steps have no page or URL expectation, so `resolveTarget` will match a same-label element on whatever page the tab is showing — [snapshot.ts:284-305](../../src/content/snapshot.ts#L284-L305).
- **Verification**: after a full replay the model gets a note: "A saved run for this task was just replayed … Check the current page. If the task is complete, call done(result) now; otherwise continue." It then gets a normal agent turn with the full system prompt and a fresh snapshot — [agent.ts:79-82](../../src/background/agent.ts#L79-L82), [agent.ts:93-101](../../src/background/agent.ts#L93-L101). That is one model call at minimum. Answer tasks have no recorded `read_text`, so they may need a `read_text` call followed by a second model turn.
- **Repair**: on failure the model gets the list of steps that succeeded plus the failing step and its reason, and continues from the current page — [agent.ts:80-81](../../src/background/agent.ts#L80-L81). It gets no candidate suggestions such as "the closest elements to the missing 'Add to cart' are [23] 'Add to bag'".

**Fingerprint creation (`describeTarget`) and matching (`resolveTarget`)**
- `Target = {tag, role, label, css, nth}` — [snapshot.ts:12-20](../../src/content/snapshot.ts#L12-L20).
- Labels are exact strings, truncated to 80 chars, taken in this order: aria-label, aria-labelledby, `<label>`, innerText (not for `<select>`), placeholder, title, alt, img alt, name — [snapshot.ts:36-58](../../src/content/snapshot.ts#L36-L58).
- `css` is chosen in this order:
  1. An `id` that passes `stableId`.
  2. A unique `tag[attr="v"]` for `data-testid, data-test, data-qa, name, aria-label, placeholder, for, href`.
  3. A structural path with `:nth-of-type`, up to 6 levels deep, anchored at an ancestor with a stable id.

  — [snapshot.ts:251-273](../../src/content/snapshot.ts#L251-L273).
- `stableId` rejects ids that contain 3 or more digits, contain `:`, or start with `ember|react|mui|radix|headlessui` — [snapshot.ts:247-248](../../src/content/snapshot.ts#L247-L248). This lets 1–2-digit generated ids through (for example `ap-Kai-3`) and rejects real stable ids like `order-1004`.
- Uniqueness is tested against `el.getRootNode()`, which can be a shadow root or an iframe document — [snapshot.ts:243-246](../../src/content/snapshot.ts#L243-L246). Resolution, however, uses `document.querySelector(t.css)` on the top document — [snapshot.ts:292-298](../../src/content/snapshot.ts#L292-L298). Selectors recorded inside shadow roots or iframes therefore resolve against the wrong tree.
- `nth` is the element's index, in snapshot (document) order, among elements with the same tag, role and label — [snapshot.ts:275-280](../../src/content/snapshot.ts#L275-L280).
- `resolveTarget` decides in this order:
  1. The css hit, if its label still matches.
  2. The only element with the same label.
  3. The css hit even though the label changed.
  4. `same[min(nth, len-1)]`, i.e. by position.
  5. `null`.

  — [snapshot.ts:299-305](../../src/content/snapshot.ts#L299-L305). Only steps 1–3 use identity evidence. Step 4 is a guess with no confidence attached.
- `snapshotPage` fills `meta` for every visible element *before* the 300-item cap is applied — [snapshot.ts:145-148](../../src/content/snapshot.ts#L145-L148) versus [snapshot.ts:153-157](../../src/content/snapshot.ts#L153-L157). The cap therefore does not limit replay matching. Elements that are invisible or horizontally off-canvas are never in `meta` — [snapshot.ts:102-108](../../src/content/snapshot.ts#L102-L108), [snapshot.ts:136-144](../../src/content/snapshot.ts#L136-L144).

**Measured fingerprint round-trips** (record with `describeTarget`, then resolve with `resolveTarget` after a change):

| Page (testbed) | Recorded `css` / `nth` | Change | Element picked | Correct? |
|---|---|---|---|---|
| `lab/timing/rerender`: Kai's "Approve", recorded at tick 3 | `#ap-Kai-3` / 4 | same tick | Kai | yes |
|  |  | next re-render (2 s) | **Mo** | **no, silent** |
|  |  | fresh page load | **Ana** | **no, silent** |
| `lab/clicks/duplicate-delete`: Beta's "Delete" | `tr:nth-of-type(2) > td:nth-of-type(3) > button` / 1 | reload | Beta | yes |
|  |  | one row inserted above | **Alpha** (destructive) | **no, silent** |
| `lab/stress/look-alikes`: "Add" for Trail Mix | `div:nth-of-type(64) > button` / 63 | reload | Trail Mix | yes |
|  |  | one card inserted above | **Snack bar #63** | **no, silent** |
| `/shop/p/trail-mug` "Add to cart" | `form > div:nth-of-type(2) > button:nth-of-type(1)` / 0 | label changed to "Add to bag" (+ span sibling) | the same button | yes (css fallback) |
| `lab/frames/open-shadow` "Subscribe" (in shadow root) | `button` (root-relative) / 0 | reload | Subscribe | yes, only because the label was unique. `document.querySelector('button')` hit a *different* top-level button |
| `lab/forms/same-labels` Billing "City" | `#Billing-city` / 1 | reload | Billing-city | yes |

- The rerender page builds ids as `ap-${p}-${tick}` and rotates the order every 2 s — [timing.js:33-43](../../testbed/public/js/lab/timing.js#L33-L43). It records `fail` when the wrong person is approved — [timing.js:44-47](../../testbed/public/js/lab/timing.js#L44-L47).
- The duplicate-delete rows have no ids; only `data-row`, which `describeTarget` doesn't consider — [clicks.ts:131-135](../../testbed/lab/clicks.ts#L131-L135). The look-alikes cards differ only by an `<h3>` above the button — [stress.ts:27-29](../../testbed/lab/stress.ts#L27-L29).
- Product colour swatches are fingerprinted by their colour name and a positional path (measured: label `"Forest Green"`, css `div:nth-of-type(1) > section:nth-of-type(2) > form > fieldset > label:nth-of-type(1)`). The target *is* the parameter value here.

**Measured timing failures in replay**
- `lab/timing/appears-later` shows "Download report" 3000 ms after the click — [timing.js:7](../../testbed/public/js/lab/timing.js#L7). Measured: settle returned after 138 ms and the button wasn't present. Polling for the 2.5 s replay find window still didn't find it.
- A recording made when the model's own thinking time covered that 3 s gap (no `wait_for`) will therefore fail at that step on replay.
- The home-page cookie banner appears only when there is no `consent` cookie — [layout.ts:186](../../testbed/lib/layout.ts#L186). The consent cookie lasts a year — [api.ts:81-87](../../testbed/routes/api.ts#L81-L87). A run recorded on a first visit has a banner click that can't be found on the next visit, which costs 2.5 s and then hands over to the model.

### Inferences
- **The main gap is identity confidence, not speed.** Positional fallbacks (`nth`, `:nth-of-type`, small-integer ids) fail in exactly the cases where pages change between runs: re-rendered lists, inserted rows, re-sorted grids. They fail *silently*, and the lexical success test at replay.ts:49 can't catch it. A judgment is worth most where `resolveTarget` currently guesses: the `same.length > 1` positional branch, the `null` branch, and a css hit whose label disagrees.
- **Element re-identification judgment (Choice).** The state would be the recorded fingerprint, enriched with *context* at record time (row text, card heading, fieldset legend, nearby text, URL path), plus 2–20 candidate elements with the same context fields. The answer is one candidate or "none". Code keeps the fast path: an exact label match plus a consistent css hit stays deterministic. A Noul "same element?" per candidate is an alternative when several could be acceptable.
  - For the measured cases this needs the row or card text ("Beta", "Trail Mix", "Kai requested access"), which today is in neither `Target` nor the snapshot line. Adding context to the fingerprint is necessary whether or not a model is used. Even a deterministic matcher on `data-row` / heading text would fix duplicate-delete and look-alikes.
- **Step-success judgment (Noul)** could run at replay.ts:49. The state would be the step's intent (tool, target label, value), before/after URL, title, focused element and a diff of the snapshot. It should only be asked when cheap signals are ambiguous: no URL change, no snapshot diff, a "covered by" warning, or a value that doesn't read back. Asking it on every step would add a model round trip to a ~200–300 ms step.
- **Optional-step judgment.** "Is this recorded step still needed given the current page?" covers consent banners, promo modals and "sign in if needed". Recording could also mark steps as optional deterministically (for example, banners or dialogs that were dismissed). The judgment would decide skip versus wait, instead of failing after 2.5 s.
- **Parameterized replay requires:**
  1. *Slot discovery at save time* (in `remember`, agent.ts:43-55). Literal matching aligns task substrings with `args.text/value/url` and target labels ("jo@example.com", "TRAIL10", "lantern", "Forest Green"). A judgment handles non-literal links ("three"→"3", "green"→"Forest Green", "Medium"→"M").
  2. *A template plus typed parameter schema* stored on `Recording`. Each step arg or `target.label` is bound to a parameter, and `startUrl`, per-step URL and post-conditions are added.
  3. *Routing plus argument extraction at lookup time*, replacing the exact `getRecording` at agent.ts:73. Code prefilters by origin. Then a Choice over saved workflows plus "none", or a Noul per candidate ("is task B the same workflow as A, differing only in values?"), runs alongside speculative extraction questions for each slot ("which span of task B fills `color`?"). This matches the TypeSafe "route and fill known arguments" and "select instead of generate" patterns.
  4. *Target substitution*: when a target label is a parameter, find candidates in the same container as the recorded element (for example, all swatches in the fieldset). Use an exact label match first, then a Choice "which of these is colour 'red'?" with a no-match outcome, because the shop has "Clay" and "Ember Orange" but no literal "red".
  5. *Verification against the new values* (for example, the cart shows red, qty N).
  - Destructive or sensitive steps (Delete, Pay, Place order) should need a higher threshold or the model.
- **Recording quality gates.** A Noul "did the task succeed?" before saving (agent.ts:167-171) and a per-step "was this step necessary?" judgment would stop wrong or bloated runs from being saved. Recording `wait_for`-equivalent waits (or the observed time until the next target appeared) would fix the appears-later class of failure deterministically.
- **Replay latency could drop without any model**: skip the full snapshot when one `resolveTarget` call against cached meta succeeds, run replay at "instant" speed when the user allows it, and replace the fixed 2.5 s find wait with "wait for the recorded post-condition".

### Gaps
- No real saved-run data exists in the repo, so I couldn't measure replay hit rate, how often replays fail, or how long recordings get in practice.
- I couldn't time `chrome.scripting.executeScript` round trips without loading the extension, so the per-step replay overhead (2 executeScripts per find poll, plus locate, settle and `tabs.get`) is reasoned from code, not measured.
- TypeSafe latency, accuracy and cost per judgment are outside this scope (another researcher covers them). Whether a re-identification Choice beats a deterministic context matcher is untested.

## Q2. Snapshot: element selection, labels, truncation, ordering, size; could relevance ranking prune it?

### Takeaway
The snapshot is a single DOM walk that lists matching interactive elements and H1–H3 headings in document order. Labels are up to 80 chars and carry no context. It keeps everything on screen plus the nearest off-screen items, up to 300. On the testbed, snapshots are small (median 381 chars, 11 items) and only one page hits the cap. Pruning by relevance would save few tokens there. Its bigger value would be **including** off-cap elements that matter for the task and adding row or card context to identical labels. Token savings need to be measured on real, heavy sites.

### Cited Findings
- **Selection**: `a[href], button, input:not([type=hidden]), select, textarea, summary`, contenteditable, `[onclick]`, `[tabindex]:not(-1)`, and 13 ARIA roles — [snapshot.ts:29-34](../../src/content/snapshot.ts#L29-L34). Plus `H1/H2/H3` as `# text` (100 chars) — [snapshot.ts:124-130](../../src/content/snapshot.ts#L124-L130).
  - Elements under `[aria-hidden=true]` or `[inert]` are skipped — [snapshot.ts:131](../../src/content/snapshot.ts#L131).
  - The visibility test is size ≥ 2 px, visibility, display, and opacity > 0.05 — [snapshot.ts:88-92](../../src/content/snapshot.ts#L88-L92). A hidden styled checkbox or radio is replaced by its `<label>` — [snapshot.ts:133-142](../../src/content/snapshot.ts#L133-L142). Horizontally off-canvas elements are dropped — [snapshot.ts:104](../../src/content/snapshot.ts#L104).
- **Traversal**: `querySelectorAll('*')` on each root, recursing into open shadow roots and same-origin iframes. Cross-origin iframes are skipped — [snapshot.ts:110-123](../../src/content/snapshot.ts#L110-L123). Each match forces layout through `getBoundingClientRect` and `getComputedStyle`.
- **Line format**: `[ref] kind "label" extras`. Extras include checked state, value (40 chars), masked password, a select's selected option plus its first 10 options, expanded/collapsed, selected, disabled — [snapshot.ts:60-86](../../src/content/snapshot.ts#L60-L86).
- **Cap and order**: items are sorted by distance from the viewport and the closest `maxItems` are kept, but the output keeps document order. Headings count toward the cap. "(N more off-screen elements omitted…)" is appended — [snapshot.ts:153-166](../../src/content/snapshot.ts#L153-L166). `SNAPSHOT_MAX_ITEMS = 300` — [page.ts:10](../../src/background/page.ts#L10).
- A snapshot is taken at the start of every agent step — [agent.ts:93](../../src/background/agent.ts#L93) — and on every replay find poll — [replay.ts:22](../../src/background/replay.ts#L22).
- **Measured on all 253 distinct challenge start pages (279 challenges)**:
  - Snapshot text: chars p50 381, p90 1,436, p99 4,652, max 7,227. Items p50 11, p90 46, p99 209, max 300.
  - Compute time in-page: p50 1 ms, max 157 ms.
  - Only `/lab/stress/many-buttons` hit the 300 cap (4,709 omitted, 7,227 chars, 157 ms).
  - Largest after that: `/lab/scroll/inner-scroller` 6,104 chars / 209 items; `/lab/stress/look-alikes` 4,652 / 209; `/shop` 4,425 / 125; product pages ~3.1–3.3k chars / ~95 items.
- **Measured label ambiguity**: on `/lab/clicks/duplicate-delete` the model sees four identical lines `[8]…[11] button "Delete"`, and on `/lab/timing/rerender` five `button "Approve"`. The row names are in `<td>`/`<li>` text, which is neither a heading nor a label. On look-alikes the `# Snack bar #N` headings sit next to each `button "Add"`, so ordering lets the model tell them apart.
- The testbed documents the cap as a challenge: "Element snapshots are capped (FastPilot keeps the 300 nearest), so the target starts out omitted" — [stress.ts:13-15](../../testbed/lab/stress.ts#L13-L15).
- Dynamic content leaks into labels. Measured `/shop` lines include `link "Cart, 0 items"` and `button "Notifications, 3 unread"`, which change between runs. That breaks exact-label replay matching (Q1) and adds noise for the model.

### Inferences
- At roughly 4 chars per token (a rule of thumb, not measured), testbed snapshots are about 100 tokens at the median and about 1.8k at most. The 300-item cap bounds the worst case at about 300 lines. Real sites with 80-char labels could reach tens of thousands of chars, but **I did not measure real sites**.
- **A relevance Score per element** (task text plus element line plus context → "how likely is this element needed for the next step?") could:
  1. Pull task-relevant elements past the spatial cap: "Item 4999" on many-buttons, or a "Checkout" link below the fold on long pages.
  2. Drop boilerplate such as navigation, footers and filter facets when the budget is tight.
- **Candidate coverage risk**: if pruning removes the needed element, the model can't act. A safe design keeps all on-screen items deterministically, adds the top-K off-screen by Score, and keeps the "N omitted" hint. Alternatively it can prune only for low-capability or high-latency models.
- Cheaper deterministic fixes to try first:
  - Add a context field (nearest row or card text, heading, or legend) to lines that share a label.
  - Strip volatile counters from labels used for matching.
  - Keep the snapshot text for the model but keep a richer `meta` (context, attributes such as `data-*`) for replay.
- Scoring each element with a model on every step adds per-step latency. With FastPilot's ~1 ms snapshot and streaming design, ranking is only worth it if one batched request over all candidates is fast compared with the tokens it saves in the main LLM call.

### Gaps
- No real-world (non-testbed) snapshot size distribution. The testbed pages are simple compared with large e-commerce or SaaS pages.
- Token counts are estimated from character counts. No tokenizer was run.
- Whether the main LLM's latency or accuracy actually improves with pruned snapshots is untested.

## Q3. Settle detection: how it works, where it wastes time or ends too early, and whether a judgment helps

### Takeaway
After every acting tool, `settle()` waits up to 10 s for `tab.status === 'complete'`. It then waits for both network and DOM to be quiet for 60/100/200 ms (instant/fast/natural), with each capped at 2.5 s. On most testbed pages this costs about 100 ms. It costs a full 2.5 s on any page with constant mutations or a held-open request, and over 10 s on a page that never finishes loading. It can also return before delayed content appears (3 s in appears-later). These are mostly fixable deterministically, for example by ignoring periodic mutation sources. A per-action model judgment would add more latency than it saves, so a "still loading?" judgment fits only as a tie-breaker when the cap is hit.

### Cited Findings
- `settle()`: `waitTabComplete(tabId, 10_000)`, then `Promise.all([networkIdle(quiet, 2500), domQuiet(quiet, 2500)])` — [page.ts:48-58](../../src/background/page.ts#L48-L58). Quiet values: `{instant: 60, fast: 100, natural: 200}`; cap `SETTLE_MAX_MS = 2500` — [page.ts:11-12](../../src/background/page.ts#L11-L12). `waitTabComplete` polls `chrome.tabs.get` every 50 ms — [page.ts:21-28](../../src/background/page.ts#L21-L28). `inPage` retries an injection up to 3 times, each preceded by `waitTabComplete(…, 5000)` — [page.ts:31-42](../../src/background/page.ts#L31-L42).
- `domQuiet`: a MutationObserver on `document.documentElement` with `subtree, childList, attributes, characterData`. *Any* mutation resets the quiet timer; the cap is `maxMs` — [settle.ts:4-22](../../src/content/settle.ts#L4-L22). It doesn't pierce shadow roots or iframes, so mutations there are invisible to it.
- `networkIdle`: polls every 20 ms. It ignores `WebSocket, EventSource, Ping, Media` and any request in flight for 3 s or more — [cdp.ts:6-9](../../src/background/cdp.ts#L6-L9), [cdp.ts:50-62](../../src/background/cdp.ts#L50-L62). It tracks `requestWillBeSent` and `loadingFinished/loadingFailed` — [cdp.ts:64-71](../../src/background/cdp.ts#L64-L71).
- Settle runs after `click, type, select, key, hover, scroll, navigate` — [tools.ts:51](../../src/background/tools.ts#L51) — so it runs after every replay step too. Its duration is reported to the model as `(settled Xms)` — [tools.ts:59-62](../../src/background/tools.ts#L59-L62).
- **Measured at page load (253 pages)**: settle p50 104 ms, p90 105 ms, p99 2,502 ms. Three pages hit the 2.5 s cap: `/lab/stress/never-settles` (DOM), `/lab/frames/cross-origin-iframe` (network) and `/lab/reading/pdf` (network). `/shop/infinite` took 690 ms and `/app/projects` 356 ms.
- **Measured after the triggering action**:

| Page | Action | Load wait | Network | DOM | Total settle | Note |
|---|---|---|---|---|---|---|
| `lab/timing/appears-later` | click Generate | 32 | 105 | 101 | **138 ms** | target absent after settle, and still absent after another 2.5 s of polling (appears at 3 s) |
| `lab/timing/debounced` | type "lantern" | 32 | 104 | 102 | 137 ms | results present (settle was sufficient) |
| `lab/timing/long-poll` | click Request | 33 | **2,500** | 101 | **2,539 ms** | held request |
| `lab/timing/slow-response` | click Load balance | 31 | **2,500** | 100 | **2,536 ms** | |
| `lab/stress/never-settles` | none | 31 | 105 | **2,501** | **2,535 ms** | DOM changes every 50 ms |
| `lab/nav/never-loads` | click Live dashboard | **10,038** | 106 | 101 | **10,146 ms** | `readyState` stays `loading` |

- The testbed's own notes describe these traps: "The DOM changes every 50 ms, so 'wait until the DOM is quiet' never succeeds" — [stress.ts:36-38](../../testbed/lab/stress.ts#L36-L38). never-loads keeps the connection open so the tab never reaches "complete" — [nav.ts:53](../../testbed/lab/nav.ts#L53) (challenge note). long-task blocks the main thread for ~3 s, "so injected scripts cannot run meanwhile" — [stress.ts:45-46](../../testbed/lab/stress.ts#L45-L46).

### Inferences
- **Wasted time.** Every action on a "live" page (clocks, tickers, carousels, chat widgets, SSE dashboards) pays the full 2.5 s cap, because domQuiet counts every attribute or text change anywhere. A 5-action batch on such a page wastes about 12 s. Every action on a page that never completes pays at least 10 s before the quiet checks even start. A long-poll pays 2.5 s.
  - Deterministic fixes: ignore mutations from nodes that mutate periodically (learn the "churn set" during the first quiet window), weight mutations near the acted-on element, and drop the `waitTabComplete` gate when `DOMContentLoaded` has fired and the target region is stable.
- **Ending too early.** The quiet window starts after the action. Content scheduled by `setTimeout` more than 100 ms later, with no network or DOM activity in between (appears-later's 3 s timer), isn't waited for. CSS transitions and animations produce no mutations, and shadow DOM and iframe mutations are invisible to the observer.
  - In the live agent loop, the model's own thinking time hides this. In replay it causes failures, because the 2.5 s find timeout is shorter than the page's delay.
- **Is there a judgment to make?** A model call per action would cost more than the ~100 ms the typical settle takes. Deterministic settle is the better default. A Noul fits in two places:
  1. When the cap is hit: "does this snapshot look like it is still loading (spinner, skeleton, 'Contacting the bank…')?", to decide between waiting longer and proceeding.
  2. During replay: "is the next recorded target, or its post-condition, present yet?". This replaces a blind 2.5 s timeout with a condition the recording knows.
- The recording could store how long the next target took to appear during the original run (a time to the next step being ready). Replay could then wait up to that long for the specific target, a deterministic fix for appears-later.

### Gaps
- These are replications of `networkIdle`/`domQuiet` over raw CDP, not the extension's `chrome.debugger` session. The cross-origin-iframe and PDF network cap hits may be an artifact of how my CDP session reports out-of-process frame requests. I didn't verify whether the extension sees the same events.
- I didn't measure how often real sites hit the 2.5 s cap.

## Q4. Input, humanize and CDP: speed and failure detection

### Takeaway
Input is fully trusted CDP events, paced by `humanize.ts`. In the default "fast" mode a click costs about 85–185 ms of deliberate delay plus about 8–15 sequential CDP mouse events (one per path step at roughly 12 ms each, plus press and release). Typing costs about 5–14 ms per character, with 2 CDP calls per character. "Instant" removes the delays, but its `insertText` skips key events. No action checks its own effect: a covered click is only a warning, and typed values are never read back. Replay could use instant speed and cheap deterministic post-checks, with a judgment only where the expected effect is semantic (masked inputs, custom widgets).

### Cited Findings
- **Speeds** are `instant | fast | natural`, default `fast` — [types.ts:1](../../src/shared/types.ts#L1), [types.ts:13-20](../../src/shared/types.ts#L13-L20). The README table gives Fast as a 70–150 ms curved move and ~10 ms per key — [README.md:30](../../README.md#L30).
- **Mouse**: `mousePath` returns one jump for instant or a distance under 2 px. Otherwise the duration is Fitts-like, between 70–150 ms (fast) or 220–600 ms (natural). Natural overshoots 60% of the time for moves over 300 px. There is one step per 12 ms (fast) or 16 ms (natural) — [humanize.ts:24-59](../../src/background/humanize.ts#L24-L59). `moveTo` sends one `Input.dispatchMouseEvent` per path step, sequentially awaited — [input.ts:36-42](../../src/background/input.ts#L36-L42).
- **Click**: move, press, hold 15–35 ms (fast) or 50–110 ms (natural), release — [input.ts:44-51](../../src/background/input.ts#L44-L51), [humanize.ts:68-70](../../src/background/humanize.ts#L68-L70). The click point is jittered ±20% inside the element, capped at 120×40 px — [humanize.ts:62-65](../../src/background/humanize.ts#L62-L65).
- **Typing**: each character is a `keyDown` plus `keyUp` CDP pair — [input.ts:53-65](../../src/background/input.ts#L53-L65), [input.ts:88-99](../../src/background/input.ts#L88-L99). Delays are 5–14 ms (fast), or 45–120 ms (natural) plus punctuation pauses and a 4% chance of a 150–350 ms hesitation — [humanize.ts:73-80](../../src/background/humanize.ts#L73-L80). Instant uses a single `Input.insertText` — [input.ts:89-91](../../src/background/input.ts#L89-L91). Clearing a field is `Meta+a` with the `selectAll` command, then Backspace — [input.ts:83-86](../../src/background/input.ts#L83-L86).
- **Scroll**: wheel ticks of 90–130 px with 8–18 ms (fast) or 30–70 ms gaps — [humanize.ts:83-93](../../src/background/humanize.ts#L83-L93). Each scroll first evaluates the viewport size — [input.ts:101-109](../../src/background/input.ts#L101-L109).
- **Per-action overhead in `runTool`**: `chrome.tabs.get` before and after, `locateRef` injection (which scrolls into view and runs the `elementFromPoint` cover check), and for `type` an extra `refTag` injection, then settle — [tools.ts:53-91](../../src/background/tools.ts#L53-L91), [snapshot.ts:169-194](../../src/content/snapshot.ts#L169-L194).
- **Failure signals available today**:
  - "ref no longer exists": thrown as an error marked stale — [tools.ts:65-70](../../src/background/tools.ts#L65-L70).
  - The covered-point warning, not treated as an error — [tools.ts:72-76](../../src/background/tools.ts#L72-L76).
  - A URL change, which marks the rest of the batch stale — [tools.ts:59-61](../../src/background/tools.ts#L59-L61).
  - A `select` with no matching option returns an error listing the options — [snapshot.ts:209-222](../../src/content/snapshot.ts#L209-L222).

  There is no readback of typed values and no "did anything change?" signal. `domQuiet` returns elapsed ms, not a mutation count — [settle.ts:12](../../src/content/settle.ts#L12).
- `TabDebugger.attach` enables only `Network` and puts the mouse at the viewport centre — [cdp.ts:19-28](../../src/background/cdp.ts#L19-L28).
- Unit tests cover only humanize: the path ends exactly on the target, fast moves are ≤ 150 ms, natural moves ≥ 220 ms, wheel ticks add up, and instant never waits — [humanize.test.ts:5-32](../../test/humanize.test.ts#L5-L32).

### Inferences
- **Deliberate delay per step, from the constants**: a fast click is about 85–185 ms of pacing; typing 30 characters is about 150–420 ms plus about 60 CDP calls; natural mode is several times slower. The README frames humanization as matching real-person input, not bot evasion. For replays the user isn't watching, an "instant replay" option would cut pacing to near zero, but instant typing skips the key events some widgets need. A hybrid (insertText for plain inputs, per-key for masked or autocomplete fields) is a deterministic optimization.
- **Cheap deterministic failure detection to add before any judgment**:
  - Return a mutation count and changed-region summary from `domQuiet`.
  - Read back an input's value after `type`.
  - Compare focus and URL before and after.
  - Treat "covered by" as a failure during replay.
- A Noul "did this action do what was intended?" is worth calling only when those signals conflict. Examples: a phone mask that turned "555-0100" into "(555) 010-0", or a custom listbox where the visible value text differs from what was asked for.

### Gaps
- I didn't measure the real CDP round-trip latency inside the extension, or how much of a step's wall-clock goes to pacing versus IPC.

## Q5. The Gauntlet testbed: scenarios, current latency and success measurement, and what a TypeSafe benchmark needs

### Takeaway
The testbed is a broad, deterministic, server-scored site: 279 challenges (235 supported today), auto, answer and handoff checks, decoy-aware answer checking, trusted-event flags, prompt-injection violations, and per-challenge elapsed time. It is not yet a benchmark harness. Nothing drives FastPilot automatically, no agent-side telemetry (model calls, tokens, settle, replay) is collected, and results aren't scoped to a run. Pages are identical on every load, so replay robustness can't be stressed, and challenges don't come in parameter families. Three API endpoints also hang because of a handler bug, which makes three challenges unsolvable.

### Cited Findings
- **Size and mix (measured from the registry)**:
  - 279 challenges, 235 "supported today", 44 gap probes.
  - Checks: auto 202, answer 68, handoff 9. Levels: 1: 106, 2: 157, 3: 16.
  - Areas: site 5, shop 16, account 9, support 12, app 17, plus 20 lab categories: clicks 23, frames 9, text 17, choices 15, ranges 10, files 5, drag 7, keyboard 10, hover 6, scroll 10, timing 11, dialogs 13, windows 5, nav 15, forms 14, reading 15, visual 6, adversarial 13, stress 8, locale 8.
  - The README says "about 280" challenges and "about 45" gap probes — [README.md:72](../../README.md#L72), [README.md:83](../../README.md#L83).
- **Model**: `Challenge = {id, area, title, path, task, check: 'auto'|'answer'|'handoff', needs: Capability[], level, answer?, reject?, note?, onStart?}` — [challenges.ts:19-45](../../testbed/challenges.ts#L19-L45). GAPS capabilities are defined at [challenges.ts:11-15](../../testbed/challenges.ts#L11-L15). Answers match numbers within 0.005 or whole-word token sequences, and decoy strings cause rejection — [challenges.ts:97-109](../../testbed/challenges.ts#L97-L109). Lab pages register a page and its challenge together — [kit.ts:23-35](../../testbed/lab/kit.ts#L23-L35).
- **Timing**: `/challenges/start/<id>` sets a `gch` cookie with the start time and redirects to the task page — [catalog.ts:53-60](../../testbed/routes/catalog.ts#L53-L60). Reports store `ms` measured from that start (or from page load) and `trusted` taken from `event.isTrusted` — [api.ts:20-29](../../testbed/routes/api.ts#L20-L29), [gauntlet.js:13-17](../../testbed/public/js/gauntlet.js#L13-L17), [gauntlet.js:40-51](../../testbed/public/js/gauntlet.js#L40-L51). The manual flow is "Press Start … copy its task into the FastPilot side panel" — [README.md:78](../../README.md#L78). Measured ms therefore include human copy-paste time.
- **Results**: attempts accumulate per challenge. Status is `pass` if *any* attempt passed (unless there's a violation or a manual mark), and `passMs` is the **first** pass's ms — [results.ts:57-78](../../testbed/lib/results.ts#L57-L78). `GET /api/results` returns every challenge with its result and strips answers — [api.ts:42-60](../../testbed/routes/api.ts#L42-L60). Results and the site can be reset — [api.ts:62-79](../../testbed/routes/api.ts#L62-L79). Results persist in `testbed/.data/results.json` — [results.ts:25](../../testbed/lib/results.ts#L25).
- **Wrong-target ground truth exists for several pages**: declarative `data-pass`/`data-fail`/`data-violation` — [gauntlet.js:118-127](../../testbed/public/js/gauntlet.js#L118-L127); rerender reports `fail` for the wrong person — [timing.js:44-47](../../testbed/public/js/lab/timing.js#L44-L47); look-alikes uses `data-fail` on the wrong cards — [stress.ts:29](../../testbed/lab/stress.ts#L29).
- **Mostly deterministic**: the only `Math.random` uses in routes are the 2FA code — [account.ts:516](../../testbed/routes/account.ts#L516) — and the chat-bot delay — [support.ts:380](../../testbed/routes/support.ts#L380). There is no variant, seed or perturbation mechanism (a grep for variant/seed/perturb found only data seeding).
- **Value-specific checks**: the add-mugs check is hard-coded to `trail-mug`, `Forest Green` and qty 3 — [shop.ts:32-34](../../testbed/routes/shop.ts#L32-L34), [shop.ts:131-133](../../testbed/routes/shop.ts#L131-L133). `onStart` exists and can reset state per challenge — [challenges.ts:43-44](../../testbed/challenges.ts#L43-L44).
- **Bug found (measured)**: three handlers return a `setTimeout` handle: `get('/api/lab/slow', (req) => setTimeout(...))` — [timing.ts:63](../../testbed/lab/timing.ts#L63); `/api/lab/longpoll` — [timing.ts:68](../../testbed/lab/timing.ts#L68); `/api/lab/description` — [reading.ts:121](../../testbed/lab/reading.ts#L121).
  - `finish()` passes any non-undefined return value to `html()` — [http.ts:153-156](../../testbed/lib/http.ts#L153-L156). `send()` then calls `res.end(<Timeout>)` after `writeHead` — [http.ts:73-78](../../testbed/lib/http.ts#L73-L78), which throws `ERR_INVALID_ARG_TYPE`. The catch skips the error page because headers count as sent — [http.ts:189-192](../../testbed/lib/http.ts#L189-L192). When the timer fires later, `json()` does nothing.
  - On Node v26.10.0 the server logged this TypeError and a plain `fetch('/api/lab/slow')` didn't return within 60 s. `lab/timing/slow-response`, `lab/timing/long-poll` and `lab/reading/show-more` (which call these endpoints — [timing.js:62-66](../../testbed/public/js/lab/timing.js#L62-L66), [timing.js:103-106](../../testbed/public/js/lab/timing.js#L103-L106), [reading.js:10-14](../../testbed/public/js/lab/reading.js#L10-L14)) therefore can't be passed.
  - `test/testbed.test.ts` only loads pages and a few APIs, so it doesn't catch this — [testbed.test.ts:29-113](../../test/testbed.test.ts#L29-L113).
- **Challenges relevant to the redesign**:
  - Re-identification: `lab/timing/rerender`, `lab/clicks/duplicate-delete`, `lab/stress/look-alikes`, `lab/forms/same-labels`, `lab/clicks/icon-only`, `lab/scroll/virtual`, `app/inbox-archive` (virtualized).
  - Settle: `lab/stress/never-settles`, `lab/nav/never-loads`, `lab/timing/*` (11), `lab/stress/long-task`.
  - Snapshot: `lab/stress/many-buttons`, `huge-table`, `huge-select`, `many-frames`, `deep-dom`.
  - Workflows that are near-parameter variants: `shop/add-mugs` vs `shop/size-and-color`; `shop/checkout-to-payment` vs `shop/buy-summit-pack` (the latter a handoff).
  - Injection and handoff: `lab/adversarial/*` (13), `site/cookie-consent`.

### Inferences
- **Can it measure end-to-end latency and success today?** Success, partly: auto and answer checks are server-side and trustworthy, while handoff needs a manual mark on the scoreboard. Latency, only coarsely: elapsed time from Start to the pass, including human time, first pass only, with no breakdown into model, settle and replay.
- **What a TypeSafe-vs-current benchmark needs**:
  1. *An automated driver*: launch Chromium or Chrome for Testing with the built extension, and add a dev-only hook in the service worker that starts a task and streams `LogEvent`s. Today tasks only start from the side-panel port — [index.ts:10-41](../../src/background/index.ts#L10-L41).
  2. *Run-scoped telemetry*, for example `POST /api/telemetry`, recording per run: run id, mode (model / exact replay / parameterized replay / TypeSafe), wall-clock, LLM calls, input and output tokens, TypeSafe calls and latency, snapshot chars per step, settle ms and cap hits, replay steps attempted and succeeded, fallback reason, and the server's verdict. agent.ts already emits step, snapshot and model timings — [agent.ts:150](../../src/background/agent.ts#L150) — and replay emits per-step ms — [replay.ts:50](../../src/background/replay.ts#L50).
  3. *Run-scoped results*: results keyed by run id, or a reset between runs, because status and `passMs` keep the first pass forever (results.ts:65-78).
  4. *A perturbation layer*: a seed via query or cookie that deterministically changes labels ("Add to cart"→"Add to bag"), reorders lists, inserts rows or cards, regenerates ids with small integers, adds or removes banners, and delays content. This tests re-identification and step verification. Today exact replay on the testbed will look better than on real sites.
  5. *Parameterized challenge families*: the task template, typed values and server check are generated together (for example add-mugs with colour × qty, checkout with different addresses). `onStart` can store the expected values in the session. Paraphrase sets per challenge would test routing ("Put three green trail mugs in my cart").
  6. *Protocol per supported challenge*: cold model run → exact replay → replay under perturbation → paraphrase → parameter variant, under the current design and the TypeSafe design. Metrics: pass rate, **silent wrong-action rate** (fail or violation attempts recorded during replay), wall-clock to pass, LLM calls and tokens, judgment calls and latency, fraction of steps done without the main LLM.
  7. *Offline micro-benchmarks that need no LLM agent*: my headless harness shows that the real fingerprint and snapshot functions can be driven over CDP against the testbed. That gives labelled datasets for an element re-identification judgment (recorded fingerprint, candidates after perturbation, ground-truth element from `data-row`/`data-approve`/headings), for task-pair routing (workflow, paraphrase or variant), and for "still loading?" at settle cap hits.
  8. *Fix the hanging endpoints and add API-level tests* so the timing challenges are solvable and measurable.

### Gaps
- I didn't run FastPilot itself against the testbed (that needs an API key and the loaded extension), so there is no baseline pass rate or latency.
- Whether `--load-extension` works with branded Google Chrome in current versions wasn't checked. Chrome for Testing or Chromium may be required for an automated driver.

## Q6. Do `npm test` and `npm run typecheck` run offline, and what do they cover?

### Takeaway
Both run offline without credentials or a browser, and both pass. The tests cover pure helpers and the testbed server only. Replay, fingerprinting, snapshot, settle and input dispatch have no tests.

### Cited Findings
- `npm test` = `node --test test/*.test.ts` and `npm run typecheck` = `tsc --noEmit` — [package.json:6-12](../../package.json#L6-L12).
- **Measured** on Node v26.10.0: `npm test` gave **17 tests, 17 pass, 0 fail**, duration 941 ms (1.1 s wall). `npm run typecheck` exited cleanly in 0.8 s wall with no diagnostics.
- Coverage by file:
  - humanize: 4 tests — [humanize.test.ts](../../test/humanize.test.ts).
  - recordings: 2 tests, key normalization and step summary only — [recordings.test.ts](../../test/recordings.test.ts).
  - SSE stream parsing: 2 tests — [stream.test.ts](../../test/stream.test.ts).
  - testbed server: 9 tests, covering page loads, redirects, sign-in, answer checking with decoys, no answer leaks, completion codes, the cart challenge and the second origin. The server starts on ephemeral ports — [testbed.test.ts](../../test/testbed.test.ts).
- `testbed.test.ts` asserts that there are more than 250 challenges — [testbed.test.ts:39](../../test/testbed.test.ts#L39).

### Inferences
- A redesign that changes `describeTarget`/`resolveTarget` or settle would currently have no regression tests. The headless-Chrome-over-CDP approach used for these notes could become a test tier that runs offline, needs no model, and runs the content-script functions against testbed pages, including perturbation cases.

### Gaps
- No coverage tooling is configured, so I didn't compute line coverage.
