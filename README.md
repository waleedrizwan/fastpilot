# FastPilot

A Chrome extension (Manifest V3) that runs an AI agent in your own browser. It works with any model that speaks the OpenAI chat-completions API and supports tool calling.

## Why it's fast

- **Text snapshots, not screenshots.** Each turn the model gets a short list of interactive elements, like `[12] button "Add to cart"`. Screenshots are taken only when the model asks for one.
- **Batched actions.** The model can return several actions in one reply, for example filling a whole form and submitting it. They run in order, and the rest of the batch is skipped if the page navigates or an action fails.
- **Streaming execution.** Each action starts as soon as its tool call has finished streaming, while the model is still writing the next one.
- **Settle detection, not sleeps.** After each action the agent waits until the DOM and network have been quiet for 60–200 ms, with a 2.5 s cap.
- **Knows when to stop.** The model calls `done` as soon as the task's actions have worked, rather than hunting for a confirmation that many pages never show. If the model repeats a turn it already took on the same unchanged page, those repeats are counted: after two it's told it's going in circles, and after six the run stops. Any page it hasn't seen before resets the count.
- **Any endpoint.** Point it at Groq or Cerebras for very fast inference, or at a local model.

## Saved runs (replay)

When a task finishes, its actions are saved for that site and task. The next time you run the same task on the same site (case, spacing and trailing punctuation don't matter), FastPilot replays those actions without asking the model. It then makes **one** model call to check the result or produce the answer.

- **Finding elements again.** Each recorded element keeps a fingerprint: tag, role, visible label, a selector that was unique when recorded (a stable id, a `name` or `data-testid` attribute, or a short path), and its position among elements with the same label. Generated ids like `react-123` are ignored. If the label changed but the selector still matches, the selector wins.
- **When a step fails.** If an element doesn't show up within 2.5 s, or an action errors, the replay stops. The model is told which steps worked and continues from the current page. If it finishes, the saved run is updated with the working steps.
- **Managing runs.** Turn replay off or on in Settings. View and delete runs under **Saved runs** in the side panel.

Replay keys on the exact task text. "Order a blue mug" and "Order a red mug" are separate runs.

## How input works

Clicks, typing and scrolling go through the Chrome DevTools Protocol (`chrome.debugger`), so the page receives real trusted events. Custom dropdowns and React inputs that ignore `element.click()` work as they would for a person. Mouse movement follows curved, eased paths and typing has a varied rhythm. Choose a speed in Settings:

| Speed | Mouse | Typing |
|---|---|---|
| Instant | jumps straight to the target | pastes the whole string |
| Fast (default) | 70–150 ms curved move | ~10 ms per key |
| Natural | 220–600 ms, sometimes overshoots and corrects | 45–120 ms per key with pauses |

While a task runs, Chrome shows a "started debugging this browser" bar. That's Chrome's own notice for `chrome.debugger` and can't be hidden. The extension attaches only for the length of a task.

## Setup

```bash
npm install
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick the `dist/` folder.
3. Click the FastPilot toolbar icon to open the side panel.
4. Open **Settings** and choose a provider, a model id and an API key.

For development, `npm run dev` rebuilds on save. Load `dist/` the same way.

### Providers

| Provider | Base URL | Notes |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | |
| OpenRouter (default) | `https://openrouter.ai/api/v1` | One key for many models. Default model is `anthropic/claude-haiku-5.5`, and requests go to the provider with the highest throughput |
| Groq | `https://api.groq.com/openai/v1` | Very fast inference |
| Cerebras | `https://api.cerebras.ai/v1` | Very fast inference |
| Ollama | `http://localhost:11434/v1` | Start it with `OLLAMA_ORIGINS="chrome-extension://*" ollama serve`, otherwise requests from the extension get a 403 |
| LM Studio | `http://localhost:1234/v1` | Enable CORS in the server settings |

The model must support tool (function) calling. Your API key is kept in `chrome.storage.local`, which is fine for personal use. Don't publish the extension with keys stored this way.

## Trying it

```bash
npm run fixture
```

Open `http://localhost:5174` and try a task such as *"Fill the order form for Jo Doe, jo@example.com, Canada, size Medium, gift wrapped, submit it, then tell me the code at the bottom of the page."* Use the **Snapshot** button to see exactly what the model sees. The log shows how long each step took.

## Test site (Gauntlet)

For broader testing, `testbed/` is a full website built to exercise every kind of interaction, with about 280 scored challenges.

```bash
npm run testbed
```

Open `http://localhost:5175/challenges`. Press **Start** on a challenge (this opens its page and starts a timer), copy its task into the FastPilot side panel, and watch `http://localhost:5175/scoreboard` fill in.

- **The site.** A store with filters, product pages, a cart and a four-step checkout; accounts with sign-in, registration, password reset through a fake mailbox, two-factor codes and settings; a help center, support tickets with attachments, a chat bot and a blog; and a single-page workspace app (sortable tables, kanban board, calendar, docs editor, a virtualized 10,000-message inbox, command palette).
- **The Lab.** 20 categories with one mechanic per page: clicks, shadow DOM and frames, text input, choices, ranges and dates, files, drag and drop, keyboard, hover, scrolling, timing, dialogs, windows and tabs, navigation, forms, reading, visual, adversarial, stress, and locale and state.
- **Scoring.** Each challenge is checked one of three ways. *Auto*: the page or server detects the goal state. *Answer*: the agent types what it found into the page's Answer box, and the server checks it. *Handoff*: the agent should stop and give control back (CAPTCHA, password, 2FA, payment); doing the action records a violation, and you mark the result on the scoreboard. Prompt-injection traps also record violations. A pass shows a short completion code so you can match it against FastPilot's `done()` text.
- **Gap probes.** About 45 challenges need something FastPilot has no tool for yet: drag, file upload, double-click, right-click, long-press, modifier clicks, native dialogs, new tabs, cross-origin frames, closed shadow roots, canvas coordinates, basic auth. They are tagged, and the scoreboard can show them apart from "supported today".
- **Two origins.** The server also listens on `http://127.0.0.1:5176`, a different origin, for the cross-origin iframe and popup challenges. Set `PORT` and `OTHER_PORT` to move them.
- **State.** Results are saved in `testbed/.data/results.json`. Carts, orders, tickets and sign-ins live in memory; the scoreboard can reset them. Use **Sign in as demo** on the challenges page for tasks that need an account (demo / trailhead).
- **API.** `GET /api/results` returns every challenge with its result, for scripting runs.

The server is plain Node with no dependencies (`testbed/server.ts`). Each lab category is one file in `testbed/lab/` plus one script in `testbed/public/js/lab/`; `lab()` in `testbed/lab/kit.ts` registers a page and its challenge together.

### Running challenges automatically

`npm run gauntlet` runs FastPilot through the challenges for you and prints a scorecard. It builds the extension if `dist/` is out of date, starts Gauntlet if it isn't running, and runs the selected challenges one at a time in your own Chrome, the one you browse with, so you can watch each tab as it runs.

One-time setup in that Chrome: load `dist/` with **Load unpacked** on `chrome://extensions`, then open `chrome://inspect/#remote-debugging` and turn on **Allow remote debugging for this browser instance**. Each run, Chrome asks "Allow remote debugging?": click **Allow**. The runner then reloads FastPilot from `dist/` so it runs the current build, opens each challenge as a tab in your window, and closes only the tabs it opened. While a task runs, Chrome shows its "started debugging this browser" bar, as it does when you use FastPilot yourself.

```bash
FASTPILOT_API_KEY=sk-... npm run gauntlet -- --only supported --area lab:clicks
```

For each challenge the runner opens `/challenges/start/<id>` in a new tab and gives the task to the agent. It waits for the agent to finish or time out (180 s by default), then reads the result from `/api/results`. Handoff challenges are marked on the scoreboard for you: pass if the agent called `handoff()` and no violation was recorded, fail if it finished any other way. The summary counts pass, fail, violation, timeout and error per area, then for supported challenges and gap probes, with average times. A JSON report with each challenge's outcome, site attempts and agent log is written to `testbed/.data/runs/`.

- **Model.** `FASTPILOT_API_KEY`, `FASTPILOT_MODEL` and `FASTPILOT_BASE_URL` choose the provider. The defaults are OpenRouter and the side panel's default model. Settings you don't set here come from FastPilot's own Settings in your Chrome. If no key is saved there, the provider's usual variable is used, such as `OPENROUTER_API_KEY`. The key is passed to the extension in memory only. It is never saved to the Chrome profile, the report or the output.
- **Choosing challenges.** Use `--area` (`lab` matches every lab category), `--only supported|gaps`, `--check auto|answer|handoff`, `--id` (an id, a prefix such as `lab/clicks`, or a glob), `--level` and `--limit`. Add `--list` to print the selection without running anything.
- **A clean start for each challenge.** Before each one, the runner resets the site's carts, orders and sign-ins (`--keep-state` skips this). It answers the cookie banner with "Reject non-essential", as a person would have done once, and sets a cookie that hides the challenge strip's pass/fail status from the agent. Tasks that say "Sign in as demo" start signed in as demo. Saved-run replay is off unless you pass `--replay`, and `--reset` clears each challenge's earlier results first.
- **Other browsers.** `-v` prints the agent's log as it runs. `--cdp http://127.0.0.1:9222` attaches to a different Chrome you started with `--remote-debugging-port=9222 --user-data-dir=<dir>` and `dist/` loaded. There is no headless mode: FastPilot always runs in a real, visible Chrome.
- **How it reaches the agent.** The service worker has a small test hook, `fastpilotTest.run(task, emit, { tabId, settings })`, which the runner calls over the DevTools protocol. Only a debugger attached to the worker can call it. If a task ignores Stop after a timeout, the runner restarts the worker so the next challenge can run.

`npm run gauntlet -- --help` lists every option.

## Layout

```
src/background/index.ts        service worker: talks to the side panel
src/background/agent.ts        agent loop and system prompt
src/background/tools.ts        tool schemas and their implementations
src/background/llm/            provider interface + OpenAI-compatible adapter
src/background/cdp.ts          chrome.debugger wrapper, network-idle tracking
src/background/input.ts        trusted mouse/keyboard actions
src/background/humanize.ts     mouse paths and typing rhythm (pure, unit-tested)
src/background/page.ts         injects page code, waits for the page to settle
src/content/snapshot.ts        element snapshot and ref lookup (injected into pages)
src/content/settle.ts          DOM-quiet detector (injected into pages)
src/sidepanel/                 UI
testbed/                       Gauntlet test site and its runner, testbed/runner.ts (see "Test site")
```

Functions in `src/content/` are injected with `chrome.scripting.executeScript`, so each must be self-contained: no imports and no references to outside code.

To add a provider with a different API (Anthropic, Gemini), implement `LLMProvider` from `src/background/llm/types.ts` and pick it in `agent.ts`.

## Limits

- The agent hands control back to you (`handoff`) on CAPTCHAs, logins, 2FA and purchases. It doesn't try to get around bot detection.
- Chrome blocks extensions on `chrome://` pages and the Chrome Web Store.
- Cross-origin iframes aren't included in the snapshot.

## Tests

```bash
npm test
```
