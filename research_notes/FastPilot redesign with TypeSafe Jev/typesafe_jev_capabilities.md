# TypeSafe and Jev (System One models) as a building block for a fast browser-automation agent

Research date: 2026-10-21. Primary sources: live TypeSafe docs (docs.typesafe.ai, fetched as Markdown via the `llms.txt` index), the OpenAPI spec at api.typesafe.ai, and the JS SDK source on GitHub (v0.7.0). There was no `TYPESAFE_API_KEY` in the environment, so **no authenticated test call was made**. The only live probes were unauthenticated requests (CORS preflight and round-trip timing) to `api.typesafe.ai`, which are marked as such below. Cookbook numbers are vendor-published runs, not independent benchmarks.

---

## 1. What exactly are TypeSafe "System One" models and Jev? How do they differ from a general LLM? What variants exist?

### Takeaway
Jev is a hosted, non-generative "decision model". You send a `state` (text or JSON) plus a map of typed questions, and it returns per-question typed answers with full probability distributions in one parallel pass. It never generates text, reasoning, or tool calls. The current versions are `jev-1.13.0` (the stable `jev-latest`) and `jev-1.14.0` (`jev-preview`, released 2026-10-14). Both cost $0.042 per million input tokens, with output free.

### Cited Findings
- **Definition.** System One models are "a class of AI models built to make fast, structured decisions that software can use directly. A System One model evaluates a state and returns typed answers and probabilities." Jev is "TypeSafe's flagship model and the first System One model." — [System One](https://docs.typesafe.ai/concepts/system-one)
- **What it does not do.** Jev "does not generate text, write code, or hold a conversation". It is "not a drop-in replacement for the LLM behind Claude Code, Cursor..." and has no `model: "jev-latest"` setting that turns an agent into a Jev-powered agent. — [Jev with coding agents](https://docs.typesafe.ai/introduction/coding-agents)
- **Primitives.** There are three production question types:
  - **Choice** returns `choice`, `probabilities` and `confidence`.
  - **Score** returns `score`, `legend`, `probabilities` and `confidence`. The score is a probability-weighted average of the levels, so it can fall between them.
  - **Noul** returns `noul`, the probability of "yes" from 0 to 1.
  
  A fourth type, **Box**, locates something in an image. It is experimental. — [Primitives](https://docs.typesafe.ai/primitives); [Box](https://docs.typesafe.ai/primitives/box)
- **Parallel and isolated questions.** "Every question is evaluated in parallel and in isolation against the same state in one go. Adding questions barely changes the response time... adding more questions does not create context-rot." — [Introduction](https://docs.typesafe.ai/introduction)
- **Answers are constrained to supplied options.** "The model returns a probability distribution over your options or levels, never a value outside them." Answers are independent of each other. — [Primitives](https://docs.typesafe.ai/primitives)
- **Training (RLCD).** Jev is trained with "Reinforcement learning for calibrated decisions". The goal is that outcomes assigned probability 0.8 occur about 80% of the time. Calibration describes groups of predictions, "not a guarantee about any single answer." — [AI primer](https://docs.typesafe.ai/introduction/machine-learning-primer)
- **Architecture.** The launch blog describes "a new model architecture" with a parallel sampler. Outputs are produced in a single query rather than token by token. Parameter count and architecture details are not disclosed. — [TypeSafe launch blog](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- **Current models (models page):**
  - `jev-1.14.0` (Jev 1.14, available from October 14, 2026) and `jev-1.13.0`.
  - Both cost **$42 per Btok, which is $0.042 per Mtok, input only; output tokens are free**.
  - Both have a context of **64k tokens per request and 32k per question**.
  - Aliases: `jev-latest` points to `jev-1.13.0` and is the SDK default. `jev-preview` points to `jev-1.14.0`.
  - Aliases move when new releases ship, so pin a versioned ID if you have tuned thresholds.
  
  — [Models](https://docs.typesafe.ai/models)
- **Older versions.** Cookbooks written in September 2026 use `jev-1.12`. — [Line-by-line search](https://docs.typesafe.ai/cookbooks/semantic_find); [SDE cascade](https://docs.typesafe.ai/cookbooks/sde_cascade)
- **No fine-tuning.** "Jev is not fine-tuned or LoRA-adapted with customer data... the same weights serve every account." Customization happens through `state`, `instructions`, `criteria` and decomposition. — [Models](https://docs.typesafe.ai/models)
- **Data handling.** Jev "is not trained on customer requests or responses". Zero data retention (ZDR) is available for enterprise customers. — [Models](https://docs.typesafe.ai/models)
- **Language.** English is the primary training language. Other languages, including CJK scripts, are "handled but not equally well". — [Models](https://docs.typesafe.ai/models)
- **Launch timing.** Jev was announced 2026-09-15 as early access, with developers being brought off a waitlist. The public JS SDK first shipped as 0.5.7 on 2026-09-11, and the Python SDK on 2026-09-14. — [Launch blog](https://typesafe.ai/blog/introducing-system-one-models-and-jev); [JS changelog](https://docs.typesafe.ai/sdk/javascript/changelog); [Python changelog](https://docs.typesafe.ai/sdk/python/changelog)
- **Vendor workflow evals (relayed by DataCamp; not independently reproduced).**

  | Model | Agreement with reference answers (4 workflows) |
  | --- | --- |
  | Jev | 67.8% |
  | GPT-5.6 Terra | 67.9% |
  | GPT-5.6 Sol | 74.1% |
  | Claude Opus 5 | 73.1% |

  - Reference answers were averages of frontier-model outputs.
  - Structured-output error rate: Jev 0% versus 0.58% to 45.5% for the LLMs.
  - "No large-scale independent reproduction has surfaced yet."
  
  — [DataCamp](https://www.datacamp.com/blog/system-one-models-jev)
- **Distribution.** Jev is also listed in DigitalOcean's Model Catalog (Serverless Inference). That article gives no endpoint details. — [DigitalOcean](https://www.digitalocean.com/resources/articles/what-is-jev)

### Inferences
- Jev is best understood as a calibrated classifier, ranker and verifier that takes natural-language task definitions at call time. It is not a smaller LLM. In FastPilot it cannot be the planner that emits free-form tool calls, but it can make any decision whose answer space code can enumerate.
- Calibrated per-option probabilities are what most LLM tool-calling lacks. They allow numeric control flow: act, ask, or escalate.
- On vendor evals its quality sits near a mid-tier frontier LLM on "System One-shaped" questions, below the top models. So it fits as a fast first pass with escalation, not as the sole decision maker on hard steps.

### Gaps
- Architecture, parameter count and training data are undisclosed.
- No changelog or jaggedness page describes what changed in Jev 1.14 beyond images and Box support. Only a 1.13 jaggedness page exists.
- It is unclear whether the console is open sign-up or still waitlisted as of October 2026. The quickstart just says to get a key from console.typesafe.ai/keys.

---

## 2. What is the API/SDK surface? Can it be called from a Chrome extension service worker?

### Takeaway
There is one inference endpoint: `POST https://api.typesafe.ai/v1/systemone`. It takes Bearer API-key auth and returns a single, non-streaming JSON response. The official TypeScript SDK (`@typesafe-ai/sdk`, MIT, zero dependencies) is a thin `fetch` wrapper that runs in an MV3 service worker without the browser override flag. A raw `fetch` is just as easy. The API's CORS policy only allows TypeSafe's own console origin, so FastPilot must call it from the service worker with `host_permissions`, not from a content script. Jev is **not** OpenAI chat-completions compatible, so it needs its own small client.

### Cited Findings
- **Endpoints.**
  - `POST /v1/systemone`: "Answer one or more questions about the content supplied in `state`." Answers are keyed by your question names and include the `model` that answered and `usage`.
  - `GET /v1/models`: lists available names, currently the aliases. Versioned IDs are accepted whether or not they are listed.
  - Auth is `Authorization: Bearer <API_KEY>`.
  
  — [API: System One](https://docs.typesafe.ai/api/system-one); [OpenAPI](https://api.typesafe.ai/openapi.json); [Models](https://docs.typesafe.ai/models)
- **Request shape.**
  - Top level: `{ model, state, questions, assets? }`. `state` is a string, object or array. `questions` is a map with at least one entry.
  - Each question has a `type` of `noul`, `choice`, `score` or `box`, plus `instructions` (a string, object, array or null).
  - Choice `criteria`: a map of option name to description (string, object, array or null), **1 to 255 options**.
  - Score `criteria`: an ordered list of **1 to 10 levels**. The JS SDK requires at least 2.
  - Noul `criteria`: optional `{true, false}` descriptions.
  
  — [OpenAPI spec](https://api.typesafe.ai/openapi.json); [TypeSafeClient](https://docs.typesafe.ai/sdk/javascript/api/classes/TypeSafeClient)
- **Response shape.** `{ model, answers: { [id]: { type, ... } }, usage: { input_tokens, output_tokens } }`.

  | Answer type | Fields |
  | --- | --- |
  | Noul | `noul` |
  | Choice | `choice`, `confidence`, `probabilities` (sum ≈1) |
  | Score | `score`, `confidence`, `legend`, `probabilities` |
  | Box | `box{top,bottom,left,right}` as 0–1 fractions, plus `confidence` (may be null) |

  — [OpenAPI spec](https://api.typesafe.ai/openapi.json)
- **Question IDs and field references.** "Question IDs are for your code. They are not sent to the model." Questions can point at parts of the state with backticked paths such as `` `ticket.messages[0].text` ``. — [Primitives](https://docs.typesafe.ai/primitives)
- **Batching.** Batching means putting many questions in one request. There is "no limit on the number of questions in a request". The only constraints are the 64k per-request and 32k per-question token limits. No separate batch or async endpoint is documented. — [Models](https://docs.typesafe.ai/models); [Primitives](https://docs.typesafe.ai/primitives)
- **Streaming.** The OpenAPI spec defines only a single `application/json` 200 response, with no SSE or streaming variant. — [OpenAPI spec](https://api.typesafe.ai/openapi.json)
- **Request rules.**
  - Body at most 32 MiB, UTF-8 JSON with no BOM.
  - At most 64 nesting levels in each of `state`, `instructions` and `criteria`.
  - Finite numbers only.
  - Optional `Content-Encoding: gzip` or `zstd`.
  - Errors: 400 (including `max_tokens_exceeded`), 401, 413, 415, 422, 429, and 529 Overloaded.
  
  — [Request rules and errors](https://docs.typesafe.ai/api/errors)
- **Opt-in headers.** `TypeSafe-Danger-Zone-Images: true` enables images and Box. `TypeSafe-Danger-Zone-Long-Context: true` raises both context limits to 262k tokens. — [OpenAPI spec](https://api.typesafe.ai/openapi.json); [Models](https://docs.typesafe.ai/models)
- **JS SDK package.**
  - `npm install @typesafe-ai/sdk`. Answer types are inferred from your questions. The package ships ESM, CommonJS and TypeScript declarations.
  - Helpers: `choice()`, `noul()`, `score()`, `box()`, `image()`, `withAssets`.
  - Current version 0.7.0 (2026-10-14). It requires Node 22+ and no longer exports request payload types.
  
  — [JS SDK](https://docs.typesafe.ai/sdk/javascript); [JS changelog](https://docs.typesafe.ai/sdk/javascript/changelog)
- **npm metadata.** Latest is 0.7.0, with **no runtime dependencies**, `engines: node >=22`, unpacked size about 339 KB, MIT license. — [npm registry](https://registry.npmjs.org/@typesafe-ai/sdk)
- **Client configuration.**
  - `apiKey` (falls back to `TYPESAFE_API_KEY`) and `baseURL` (defaults to `https://api.typesafe.ai`).
  - `defaultModel` (`jev-latest`), `timeout` (10000 ms per attempt), and `retry`.
  - Custom `fetch`, `defaultHeaders`, `compression`, `logger`.
  - `dangerouslyAllowBrowser` ("Allow browser use, exposing the API key to page users. Default: false").
  - Per-call options: `headers`, `retry`, `timeout`, and `signal` (AbortSignal).
  
  — [TypeSafeClientConfig](https://docs.typesafe.ai/sdk/javascript/api/interfaces/TypeSafeClientConfig); [RequestOptions](https://docs.typesafe.ai/sdk/javascript/api/interfaces/RequestOptions)
- **Retry defaults.** Up to 2 retries on 408, 429 and 500–599, and on connection or timeout errors. Backoff starts at 500 ms, doubles to a 5000 ms cap, with 0.25 jitter. The client honors `Retry-After` up to 60 s. — [RetryPolicy](https://docs.typesafe.ai/sdk/javascript/api/interfaces/RetryPolicy)
- **Browser guard (SDK source).** The guard is `isBrowser()`, which is true only when `window`, `window.document` and `navigator` are all defined. The constructor throws ("would expose your API key to anyone using the page") when `isBrowser() && !config.dangerouslyAllowBrowser`. The default fetch is `globalThis.fetch`. — [runtime.ts v0.7.0](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.7.0/src/runtime.ts); [client.ts v0.7.0](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.7.0/src/client.ts)
- **Compression in the SDK.** zstd compression reads `node:zlib` through `process.getBuiltinModule` "without an import so the SDK still loads where Node modules don't exist". Without it, bodies are sent uncompressed. — [compression.ts v0.7.0](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.7.0/src/compression.ts)
- **Extra SDK headers.** The SDK sends `X-TypeSafe-SDK`, `X-TypeSafe-Runtime` and `User-Agent` along with `Authorization`. — [client.ts v0.7.0](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.7.0/src/client.ts)
- **CORS (direct unauthenticated probe, 2026-10-21).**
  - `OPTIONS /v1/systemone` with `Origin: chrome-extension://…` or `https://example.com` returned **HTTP 400 with no `Access-Control-Allow-Origin`**.
  - With `Origin: https://console.typesafe.ai` it returned **200 with `access-control-allow-origin: https://console.typesafe.ai`**.
  - The allowed-headers list includes Authorization, Content-Type, Content-Encoding and both Danger-Zone headers. It does not include `X-TypeSafe-SDK` or `X-TypeSafe-Runtime`.
  - The API is served via Cloudflare.
  
  — [api.typesafe.ai/v1/systemone](https://api.typesafe.ai/v1/systemone) (direct probe)
- **Missing-key status mismatch.** An unauthenticated POST returned **403** with `{"detail":{"error_type":"authentication_error","message":"Must supply an API key!..."}}`. The docs say 401 for a missing key. — [api.typesafe.ai/v1/systemone](https://api.typesafe.ai/v1/systemone) (direct probe); [Errors doc](https://docs.typesafe.ai/api/errors)
- **Chrome extension networking.**
  - "A script executing in an extension service worker or foreground tab can talk to remote servers outside of its origin, as long as the extension requests host permissions."
  - "Cross-origin requests are always treated as such in content scripts, even if the extension has host permissions."
  
  — [Chrome for Developers: Cross-origin network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- **API key placement.** The TypeSafe skill says "Keep API credentials server-side in web apps." — [TypeSafe agent skill](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md)
- **Alternative routes.** Both use TypeSafe's own API shape, not chat-completions.
  - OpenRouter: base URL `https://openrouter.ai/api`, model `~typesafe/jev-latest`.
  - Vercel AI Gateway: base URL `https://ai-gateway.vercel.sh/typesafe`, model `typesafe-ai/jev`.
  - Either "requires the alternative API to follow the TypeSafe OpenAPI spec".
  
  — [Python SDK basic usage](https://docs.typesafe.ai/sdk/python/usage/basic)

### Inferences
- **Calling from FastPilot.** The background service worker can call `https://api.typesafe.ai/*` with a plain `fetch` once that host is in `host_permissions`, which bypasses CORS. The SDK would also work there, because the guard only checks for `window` and `document`. A side panel or popup page would need `dangerouslyAllowBrowser: true` and is CORS-blocked from that origin anyway.
- **Hand-rolling the client.** Given FastPilot's no-runtime-deps rule, a roughly 40-line `fetch` client with typed answer interfaces is simpler than bundling the SDK. The SDK is dependency-free, but Node 22+ is its declared engine.
- **Key model.** As with FastPilot's existing BYO OpenAI-compatible key, the user would paste a TypeSafe key, or an OpenRouter or Vercel key, into extension storage. The SDK's warning about page exposure matters less in a service worker, but the key is still readable by anyone with access to the profile.
- **No streaming.** This barely matters at about 100 ms, but Jev answers cannot be consumed incrementally the way FastPilot's streamed tool calls are.

### Gaps
- No TypeSafe documentation mentions Chrome extensions, ephemeral or scoped tokens, or origin allow-listing for third-party clients.
- I could not confirm whether `X-TypeSafe-Runtime` would be rejected in a CORS context. That is moot from a service worker with host permissions.
- I did not test the SDK in a real MV3 service worker.

---

## 3. Latency, throughput, token/context limits, and pricing, compared with a frontier LLM call

### Takeaway
Vendor-published round trips are about 100–150 ms per request, with a stated range of 70–500 ms. A single call can carry many questions: 13 questions took 0.27 s. Comparable LLM calls in the same cookbooks took 0.8–3.9 s for small non-reasoning models and 10–14 s for reasoning models. At $0.042 per million input tokens with free output, a call over a typical 3–8k-token page snapshot costs about $0.0001–0.0003. No p50/p95 figures, public rate-limit numbers, or scaling curves are published.

### Cited Findings
- **Headline latency claims.**
  - "Most queries complete in about 100 ms. System One is fast enough for real-time request paths and user interfaces." — [How to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one)
  - "Frontier intelligence at real-time speeds (150ms)... Fast and smart enough to be programmed to play games or embedded into a UI." — [Use-case map](https://docs.typesafe.ai/concepts/use-case-map)
  - Launch blog: Jev's end-to-end response time is 70–500 ms, versus 3–329 s for frontier LLMs. It claims "40x to 200x faster" on System One-shaped queries. Speed evals ran from West Coast laptops, and no p50/p95 is given. — [Launch blog](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- **Measured cookbook latencies (mean of 15 sequential calls).** These include network time.
  - **Self-consistency: nouls** (one claim, 14 Noul questions per call):

    | Model | Mean round trip | Cost per call |
    | --- | --- | --- |
    | Jev (TypeSafe) | 111 ms | $0.000043 |
    | claude-haiku-4-5 | 1485–1780 ms | $0.00165–0.0018 |
    | gpt-5.4-mini | 1113–1405 ms | $0.00095–0.00118 |
    | gpt-5.5 (reasoning) | 11,125 ms | $0.033 |
    | claude-opus-4-8 (reasoning) | 13,886 ms | $0.034 |

    — [Self-consistency: nouls](https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook)
  - **Self-consistency: choices** (8 Choice questions per call):

    | Model | Mean round trip | Cost per call |
    | --- | --- | --- |
    | Jev (TypeSafe) | 114 ms | $0.000046 |
    | claude-haiku-4-5 | 992–3860 ms | not listed |
    | gpt-5.4-mini | 826–2293 ms | not listed |
    | reasoning models | 10.4–13.0 s | up to $0.041 |

    — [Self-consistency: choices](https://docs.typesafe.ai/cookbooks/consistency_choice_cookbook)
- **Batching effect.** 13 questions over the GDPR Wikipedia article in one call took **0.27 s and cost $0.000497**. Thirteen separate calls took a summed 2.71 s and cost $0.006090, which is "12.2x cheaper, 10.0x faster with no change in answers". — [Parallel questions](https://docs.typesafe.ai/cookbooks/parallel_questions)
- **Workflow benchmark latency.** Jev averaged 0.4 s, versus GPT-5.6 Terra 10.1 s, Sol 23.3 s and Opus 5 37.8 s (vendor evals). — [DataCamp](https://www.datacamp.com/blog/system-one-models-jev)
- **Throughput demo.** A Doom demo runs at about 10 queries per second, costing about $7/hour, on text-based game state. — [Launch blog](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- **Third-party browser demo (secondary sources, unverified).** A voice-controlled browser built on Jev and Playwright reported "~300ms" per decision at "$0.0002 per decision". — [DigitalOcean](https://www.digitalocean.com/resources/articles/what-is-jev); [juliangoldie.com](https://juliangoldie.com/jev-github/)
- **Network floor (my unauthenticated probe from this Mac, 5 fresh connections).**
  - The probe used an unauthenticated POST to the Cloudflare edge, so **it involved no model inference**.
  - TCP connect took 19–94 ms, and TLS was complete at 39–117 ms.
  - Time to first byte for the 403 auth rejection was **88–166 ms**, over HTTP/2.
  
  — [api.typesafe.ai/v1/systemone](https://api.typesafe.ai/v1/systemone) (direct probe)
- **Pricing.**
  - $0.042 per million input tokens; "Output tokens are free." The same rate applies to long context and to image tokens.
  - The blog says TypeSafe "can't prove it isn't subsidized" and expects prices to fall.
  
  — [Models](https://docs.typesafe.ai/models); [Images](https://docs.typesafe.ai/images); [Launch blog](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- **LLM price reference.** gpt-5.4-mini is $0.75 in / $4.50 out per Mtok, and gpt-5.5 is $5.00 / $30.00. — [SDE cascade](https://docs.typesafe.ai/cookbooks/sde_cascade)
- **Context limits.**
  - Default: 64k tokens per request (state plus all questions) and 32k per question (state plus any one question).
  - The long-context header raises both to 262k, but "is slower and less accurate".
  - Questions are unlimited in number.
  
  — [Models](https://docs.typesafe.ai/models)
- **Rate limits.**
  - Set per organization and measured in tokens per second and requests per second. Over-limit requests get 429. Actual values are only visible in the console.
  - Higher limits come with custom or enterprise plans.
  - Images have no separate rate limit.
  
  — [Models](https://docs.typesafe.ai/models); [Images](https://docs.typesafe.ai/images)
- **Concurrency guidance.** The Python SDK notes recommend reusing clients and using HTTP/1.1 for high request rates. HTTP/2 multiplexes over one connection but caps throughput. — [Python advanced usage](https://docs.typesafe.ai/sdk/python/usage/advanced)
- **Large option sets.** The blog says choices support up to 255 options, and "larger sets use a two-stage process" that causes "occasional slowdowns". The API schema itself caps Choice `criteria` at 255 (`maxProperties: 255`). — [Launch blog](https://typesafe.ai/blog/introducing-system-one-models-and-jev); [OpenAPI spec](https://api.typesafe.ai/openapi.json)

### Inferences
- **Cost per snapshot call.** A 200-element snapshot at about 15–40 tokens per line is roughly 3k–8k tokens. As state, that costs about $0.00013–0.00034 per Jev call regardless of how many questions are attached, beyond the questions' own tokens. Input alone on gpt-5.4-mini would cost about 18x more, before output tokens.
- **Speedup per decision.** Replacing an LLM round trip (about 1–3 s for small models, 10 s or more for reasoning models) with a Jev call (about 0.1–0.3 s) saves roughly 1–3 s or more per decision. On FastPilot's replay path, swapping the single verification LLM call for a Jev Noul or Choice batch would likely cut that step to roughly 100–300 ms.
- **Network share.** The network share of a Jev call from a client in Toronto is probably 40–90 ms on a warm connection, judging by the TLS and connect timings above. So keeping one connection warm in the service worker matters at this scale.
- **Rate limits.** Because limits are per organization and unpublished, a high-frequency loop (several calls per agent step) needs testing against the user's actual console limits. 429s are retried by the SDK, but each retry adds at least 500 ms.

### Gaps
- No published p50/p95 or latency-versus-state-size curve, so the cost of a 30k-token state or a 255-option Choice is unknown.
- No live authenticated latency test, because no API key was available in the environment.
- No public rate-limit numbers or free-tier and credit details.
- No latency figures for images or Box.

---

## 4. Which primitives map to browser-agent work (element choice, ranking, verification, extraction, routing, anomaly detection, confidence thresholds)?

### Takeaway
Almost every bounded decision in a browser agent maps cleanly onto a Choice, Noul or Score over a text snapshot. Choice over element IDs picks one of up to 255 elements and returns a full relevance distribution. Noul handles yes/no checks such as "did the action succeed", "is the task done" and "is a captcha, modal or error showing". Score handles graded relevance, and confidence or probability gaps drive escalation. TypeSafe publishes no browser-specific cookbook. Its line-by-line search, skill suggestion, function calling, reranking and SDE cascade recipes are the closest documented analogues.

### Cited Findings
- **Picking one of N items (direct analogue of `[12] button "Add to cart"`).**
  - The line-by-line search cookbook tags each of 218 lines with an ID (e.g. `L052| ...`). It asks one Choice whose `criteria` are the line IDs with `None` descriptions, because "the document already contains the text for each ID". It reads `probabilities` as a per-line relevance ranking.
  - In the same request, a Noul ("Does any line of the document address or answer: …?") detects when nothing matches, because "Choice probabilities always add up to 1, so some line ranks first even when the document doesn't answer".
  - Results: the right line scored 0.95 and 0.97 on answerable queries. On an unanswerable query the top line still got 0.86, but `exists` was 0.14.
  - The document was 43,980 characters.
  - The recipe works up to 255 options, "Past that, search in two passes: one Choice question picks a window of lines, and a second ranks the lines inside it."
  
  — [Line-by-line search](https://docs.typesafe.ai/cookbooks/semantic_find)
- **No-match option.** Use a "none of the above" option, or better, "a companion Noul question in the same request that checks whether anything fits at all". — [Choice](https://docs.typesafe.ai/primitives/choice)
- **Ranking candidates.**
  - Option 1: one Noul per (query, candidate) pair, sorted by `noul`. On 30-candidate BM25 shortlists for legal queries, top-1 accuracy rose from 5% to 18% and top-10 from 38% to 62%. — [Re-ranking](https://docs.typesafe.ai/cookbooks/rerank_typesafe)
  - Option 2: use comparable per-item Scores for graded ranking. — [TypeSafe agent skill](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md)
- **Many candidates as structured questions.** One Noul per candidate record can be generated in code, with the record placed in the question's structured `instructions` and the shared context in `state`, all in one request. — [Noul](https://docs.typesafe.ai/primitives/noul)
- **Verification.**
  - The SDE cascade asks per-field Nouls framed so that "`true` = something is wrong (escalate)". It escalates to a reasoning model if any flag is above 0.7, a "max-style gate (escalate if any field fires)".
  - The citation check uses one Choice to decide whether a quote's context supports a claim.
  
  — [SDE cascade](https://docs.typesafe.ai/cookbooks/sde_cascade); [Double-checking citations](https://docs.typesafe.ai/cookbooks/citation_check)
- **Routing and choosing the next tool or strategy.**
  - Function calling maps function names and closed-set arguments to Choice questions, with per-call confidence. Example: `top_movers(window='1d', direction='gainers')` at confidence 0.90, tool 0.90.
  - Intent routing sends requests to deterministic code, a specialist LLM, or a human based on Choice plus confidence.
  
  — [Function calling](https://docs.typesafe.ai/cookbooks/function_calling); [Intent routing](https://docs.typesafe.ai/patterns/intent-routing)
- **Two-stage selection from a large catalog (analogous to choosing a tool, strategy or element among many).**
  - Skill suggestion skims all 182 skills with one request, which ranks them and gates whether any skill is needed. A second request re-checks the top 3 with fuller evidence and may reject all of them.
  - Over 488 requests with claude-haiku-4-5:

    | Setup | Loads the wrong skill | Loads one when nothing fits |
    | --- | --- | --- |
    | Agent alone, with just its roster | 16.8% | 9.8% |
    | Agent with a TypeSafe suggestion | 7.3% | 4.0% |
    | Agent handed the right answer | 2.5% | 1.2% |

  — [Skill suggestion](https://docs.typesafe.ai/cookbooks/skill_suggestion)
- **Page-state classification and anomaly checks (speculative fan-out).** "Ask every question your code might need, including ones whose answer only matters for some inputs, and let the code decide which answers to use." The smart-home demo asks a long list of Choices (category, room, device, action) per request, most of them irrelevant to any one request. — [Speculative fan-out](https://docs.typesafe.ai/patterns/fan-out); [Smart home demo](https://docs.typesafe.ai/demos/smart-home)
- **Extraction by selection, not generation.** "Find candidate values or source spans in code, use a judgment to select the intended one, then copy or normalize it." Example: regexes find candidate emails, phones and amounts, then a Choice picks the requested span. — [TypeSafe agent skill](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md); [Pre-parsed value extraction](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook)
- **Generation is out of scope.** "`jev-1.13` is not trained to generate text"; "turn extraction into a Choice over the options rather than asking for the value itself." — [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- **Confidence semantics.**
  - Choice confidence = (p_max − 1/n) / (1 − 1/n).
  - Score confidence uses distance-weighted spread across levels.
  - Noul has no separate confidence. |2p−1| can be used as one.
  - TypeSafe also recommends trying **top probability** and the **top-to-second ratio**, since "Many real decisions come down to the top two candidates".
  
  — [Confidence](https://docs.typesafe.ai/confidence)
- **Thresholds scale with risk.**
  - Example gates: a 0.5 floor before acting at all, and above 0.9 required for a destructive action.
  - The confidence-routing pattern uses a 0.6 floor and above 0.85 for auto-approving a transfer, otherwise confirming with the user.
  - "Choice/Score confidence summarizes distribution concentration, not overall workflow correctness or permission to act."
  
  — [Confidence](https://docs.typesafe.ai/confidence); [Confidence-gated routing](https://docs.typesafe.ai/patterns/confidence-routing); [Agent skill](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md)
- **Changing state.** "Code can retain goals and observations while fresh judgments guide the next bounded step. Keep inferred state distinct from observed facts, and check freshness before applying a result to a changed situation." — [TypeSafe agent skill](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md)
- **Matching records.** Entity alignment decides which of 450 candidate pairs describe the same product, using one Score plus three companion Nouls that show which fields disagree. — [Entity alignment](https://docs.typesafe.ai/cookbooks/entity_alignment)
- **Web-navigation demo.** In TypeSafe's "Wikiracing" demo (link navigation between Wikipedia pages), "Jev generally finished in fewer steps" than LLMs run in non-reasoning modes. — [Launch blog](https://typesafe.ai/blog/introducing-system-one-models-and-jev)
- **Screenshot-based localization (experimental).** Images can go in `state`, `instructions` or `criteria`. Box returns one bounding box per question and has "no 'not found' answer", so pair it with a Noul. The documented pattern for small targets is to tile a large image and use a Choice over tiles, then Box within the chosen tile. — [Images](https://docs.typesafe.ai/images); [Box](https://docs.typesafe.ai/primitives/box)

### Inferences
These mappings are my own; TypeSafe has not documented them for browsers.

- **Element pick.**
  - `state = { task, step_goal, elements: "[12] button \"Add to cart\"\n..." }`, with a Choice whose criteria are the element IDs (≤255) and null descriptions.
  - Add a Noul "Does any element in `elements` let the user <step_goal>?" in the same call.
  - Act when top-1 probability or the top-to-second ratio is high; otherwise escalate to the LLM or re-snapshot.
- **Turn-level fan-out (one roughly 100 ms call per page load).** Nouls for: captcha present, blocking modal or cookie banner, error or 404 page, login wall, still loading, task goal already satisfied. Add a Choice for page type (search results, product, cart, checkout, form, other). Code routes on these before any LLM call.
- **Post-action verification.** Snapshot before and after go into state as named fields, with Nouls such as "Did `after` show the item added to the cart compared to `before`?" This would replace or augment the single verification LLM call on replay.
- **Replay fingerprint repair.** When a stored fingerprint fails to match, ask one Noul per candidate ("Is `candidate` the same control as `recorded_element`?"), following the entity-alignment pattern. Alternatively, use one Choice over the candidate IDs.
- **Snapshot pruning for the LLM.** Use the Choice distribution, or per-element Scores, to send only the top-k elements to the planner LLM. This mirrors the "classifying RAG passages" recipe and cuts LLM input tokens and latency.
- **Escalation.** The planner LLM stays for free-text arguments (what to type), multi-step reasoning and novel situations. Jev decides when the LLM is needed (SDE-cascade style).

### Gaps
- There is no TypeSafe benchmark or cookbook for DOM, accessibility-tree, or web-agent tasks. Accuracy on picking the right interactive element from a FastPilot-style snapshot is unmeasured.
- Whether Jev handles compact snapshot notation (`[12] button "..."`) as well as prose is untested.
- Box and image accuracy on UI screenshots is undocumented.

---

## 5. What cookbook patterns, examples, or recipes does TypeSafe publish?

### Takeaway
TypeSafe publishes 4 patterns, 19 cookbooks, a smart-home demo and an agent skill. The recurring compositions are:
- one request with many speculative questions
- rank-then-verify in two requests
- cheap-model-then-Jev-verify-then-escalate cascades
- Choice-over-candidate-IDs with a companion existence Noul
- confidence- or probability-gated routing to an LLM or a human

### Cited Findings
- **Patterns.** — [Patterns](https://docs.typesafe.ai/patterns)
  - **Speculative fan-out:** put every possibly-needed question in one call and let code ignore the irrelevant ones. — [fan-out](https://docs.typesafe.ai/patterns/fan-out)
  - **Confidence-gated routing:** "The answer tells you what; confidence tells you whether to act." — [confidence routing](https://docs.typesafe.ai/patterns/confidence-routing)
  - **Composite scoring:** atomic Scores combined with weights in code. — [composite scoring](https://docs.typesafe.ai/patterns/composite-scoring)
  - **Intent routing:** classify, then send to deterministic code, a specialist LLM, or a human. — [intent routing](https://docs.typesafe.ai/patterns/intent-routing)
- **Cookbooks: LLMs and agents.** — [Cookbooks index](https://docs.typesafe.ai/cookbooks)
  - **Function calling:** typed function dispatch from natural language via Choice over function names and closed-set arguments, with confidence. — [link](https://docs.typesafe.ai/cookbooks/function_calling)
  - **Skill suggestion:** two requests (skim and rank all 182 plus a gate, then re-check the top 3 with full text). Wrong loads fell from 16.8% to 7.3%. — [link](https://docs.typesafe.ai/cookbooks/skill_suggestion)
  - **Guardrails for LLMs:** one request per message, with a battery of hazard Nouls plus a harm Score. Thresholds decide pass, review, block or route. "'Ignore your instructions' scores as a jailbreak instead of working as one." It is applied to both inputs and outputs. — [link](https://docs.typesafe.ai/cookbooks/llm_guardrails)
  - **Double-checking citations:** a Choice decides whether a quote's context supports a claim. — [link](https://docs.typesafe.ai/cookbooks/citation_check)
  - **Classifying RAG passages:** score each retrieved passage, and code decides which reach the answering model. — [link](https://docs.typesafe.ai/cookbooks/classifying_rag_passages)
  - **Simple memory system:** Jev decides which requests and answers are worth remembering, and memories are added to later calls. — [link](https://docs.typesafe.ai/cookbooks/basic_memory)
- **Cookbooks: classification.**
  - **Hierarchical classification:** beam search over Choice probabilities, where "each path of the beam runs as parallel questions, so extra exploration adds little wall-clock latency". — [link](https://docs.typesafe.ai/cookbooks/hierarchical_classification)
  - **Classification using confidence:** falls back to a broader parent class when confidence is low (75 industry groups). — [link](https://docs.typesafe.ai/cookbooks/classification_using_confidence)
  - **Twitch chat filter:** one multi-question request per message, with up to 8 messages processed concurrently. — [link](https://docs.typesafe.ai/cookbooks/twitch_chat_filter)
- **Cookbooks: extraction.**
  - **SDE cascade:** gpt-5.4-mini extracts, Jev runs per-field "P(wrong)" Nouls, and the record escalates to gpt-5.5 if any flag is above 0.7. This gets "most of the quality of a big reasoning model at a fraction of the cost". — [link](https://docs.typesafe.ai/cookbooks/sde_cascade)
  - **Date extraction:** date parts as closed-set Choices with "not stated" options, resolved in code. — [link](https://docs.typesafe.ai/cookbooks/date_extraction_cookbook)
  - **Pre-parsed value extraction:** regex candidates, then Jev selects the span. — [link](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook)
  - **Structure recovery:** two dependent requests, first a Noul per line pair, then classification of the resulting blocks. — [link](https://docs.typesafe.ai/cookbooks/autoformat)
- **Cookbooks: search and matching.**
  - **Re-ranking:** a Noul per pair, sorted by value. — [link](https://docs.typesafe.ai/cookbooks/rerank_typesafe)
  - **Line-by-line search:** a Choice over 218 line IDs plus an existence Noul. — [link](https://docs.typesafe.ai/cookbooks/semantic_find)
  - **Entity alignment:** a Score plus three companion Nouls showing which fields disagree. — [link](https://docs.typesafe.ai/cookbooks/entity_alignment)
- **Cookbooks: techniques.**
  - **Self-consistency (choices and nouls):** stability across 15 repeats. — [choices](https://docs.typesafe.ai/cookbooks/consistency_choice_cookbook); [nouls](https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook)
  - **Parallel questions:** one call is 12.2x cheaper and 10x faster than 13 calls. — [link](https://docs.typesafe.ai/cookbooks/parallel_questions)
  - **Autoresearch feature discovery:** Jev probabilities used as features for a CatBoost regressor. — [link](https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery)
- **When a second request is justified.** Only "when your code cannot build the second request until it has the first answer". Skill suggestion, structure recovery and hierarchical classification are the documented cases. — [Primitives](https://docs.typesafe.ai/primitives)
- **Smart-home demo.**
  - A Vite/React single-page app.
  - A Noul detects compound requests, which are then split by an LLM.
  - General or conversational queries fall back to an LLM.
  - "Full source code will be available on GitHub at release."
  
  — [Smart home demo](https://docs.typesafe.ai/demos/smart-home)
- **Probability-based escalation in documented code.**
  - Triage code sends to manual review when `department.confidence < 0.3`.
  - It CCs a second team when that team's probability is above 0.25.
  - It asks the customer when `resolution.confidence < 0.5`.
  
  — [Choice](https://docs.typesafe.ai/primitives/choice)

### Inferences
- Three recipes map closest to a FastPilot redesign:
  - **Line-by-line search:** element pick plus existence check.
  - **Skill suggestion:** a two-stage shortlist-then-verify, with an LLM-visible hint rather than a hard override. It could inform "suggest an element or strategy to the planner LLM" without taking control away from it.
  - **SDE cascade:** the LLM proposes, Jev verifies, and the step escalates only on a flag.
- The skill-suggestion design is notable. It injects one line ("Relevant to the current request: X. Ignore this if it does not fit") into the LLM's prompt, preserving prefix caching while improving selection. This is a low-risk integration shape for an existing LLM agent loop.

### Gaps
- No cookbook covers multi-step agent loops over a changing environment, beyond the skill's one-paragraph "respond to changing state" guidance and the Doom and Wikiracing demos, whose code was not found.
- The third-party jev-voice-browser repo (Playwright-based) was only seen through secondary sources. Its code and accuracy were not verified.

---

## 6. Known limitations: weak spots, input size (can it take a 200-element snapshot?), multimodal support, determinism, rate limits

### Takeaway
A 200-element text snapshot fits easily: one Choice takes up to 255 options and each question gets 32k tokens of context. Accuracy drops with irrelevant detail, though, so prefilter.

Documented weak spots:
- literal reading
- arithmetic, counting, dates and numeric representations
- multi-hop indirection
- large distracting state
- adversarial or injected content
- a first-option bias in Choice
- no text generation

Images and screenshots work only as an opt-in "Dreamer-ready" experiment. Outputs are stable but not bit-deterministic.

### Cited Findings
- **Jaggedness list (jev-1.13, reviewed 2026-10-02).** Nine failure modes:
  1. literal reading
  2. math and numbers, including unreliable counting
  3. date and time comparison
  4. indirection
  5. "large state full of irrelevant detail"
  6. adversarial content
  7. contradictory instructions and criteria
  8. **Choice option order**: "`jev-1.13` leans toward the option that comes first"; the fix is to "reorder the options to double check"
  9. generation
  
  — [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- **Large state.** "Accuracy falls as the state grows with content unrelated to the decision... retrieve and filter in code first." Also: "Jev suffers from context rot, so unrelated material in the `state` costs you accuracy." — [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- **Adversarial content.** "State is data, and `jev-1.13` does not treat it as hostile by default. Content written to adversarially steer the model, whether that is an injected instruction... can move the answer." — [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- **Numeric representations.** Hex or RGB colors underperform English color names, and assembly underperforms high-level languages. Score levels "are weak in numerical calibration". — [Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
- **Size limits.**
  - 255 Choice options and 10 Score levels.
  - 64k tokens per request and 32k per question by default, or 262k with the long-context header ("slower and less accurate").
  - 32 MiB body and 64 nesting levels.
  
  — [OpenAPI spec](https://api.typesafe.ai/openapi.json); [Models](https://docs.typesafe.ai/models); [Errors](https://docs.typesafe.ai/api/errors)
- **Size evidence.** The line-by-line search cookbook ran 218 options over a 43,980-character document in one request. — [Line-by-line search](https://docs.typesafe.ai/cookbooks/semantic_find)
- **Multimodal: conflicting statements in the docs.**
  - The System One page and the Models table say Jev accepts text only ("Images, audio, and video are not supported (yet)"; Input: "Text").
  - The newer Images page (with SDK 0.7.0, 2026-10-14) says "Jev 1.13 and Jev 1.14 both accept images. Box questions need Jev 1.14," behind `TypeSafe-Danger-Zone-Images: true`, and calls them "Dreamer-ready... aren't yet up to our standards to call ready for production."
  - The Images page is the more recent and specific source; the other pages appear stale.
  
  — [System One](https://docs.typesafe.ai/concepts/system-one); [Models](https://docs.typesafe.ai/models); [Images](https://docs.typesafe.ai/images)
- **Image limits.**
  - PNG or JPEG stills only.
  - Each side must be **280 to 1568 px**. Images are rejected, not resized.
  - Up to 16 MiB per file.
  - Each reference use re-adds the image to the token count.
  - Image tokens are billed as input, with "guidance on estimating image token usage soon".
  - If one image fails, the whole request fails.
  
  — [Images](https://docs.typesafe.ai/images)
- **Box limits.**
  - Exactly one box per question, with no "not found" answer.
  - No recommended confidence threshold yet.
  - Small targets in large images "can be missed"; crop or tile first.
  
  — [Box](https://docs.typesafe.ai/primitives/box)
- **Determinism and stability.**
  - Docs claim "System One is designed to return stable answers across repeated evaluations." — [How to build](https://docs.typesafe.ai/concepts/how-to-build-with-system-one)
  - Noul runs: 15 repeats of 14 Nouls, with a throwaway `uid` field varied per call. Mean per-question probability standard deviation was **0.0102**, lower than all the LLM conditions. One answer still spanned 0.43–0.53, crossing a 0.5 threshold. — [Self-consistency: nouls](https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook)
  - Choice runs: 8 Choices × 15 repeats. Plurality-label repeat rate was 90.8% (LLMs: 87.5–100%), and Jev "flips on 2 of the 8 questions". With a top-probability gate of 0.60, agreement rose to 99.2%, with 74.2% of answers decided automatically. — [Self-consistency: choices](https://docs.typesafe.ai/cookbooks/consistency_choice_cookbook)
  - The setup "cannot separate sensitivity to the irrelevant field from variation that would occur on identical requests".
  - There is no seed or temperature parameter in the API.
  
  — [Self-consistency: nouls](https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook); [OpenAPI spec](https://api.typesafe.ai/openapi.json)
- **Model versioning.** Aliases move, so "its answers can change without any change to your code". Pin a versioned ID if thresholds are tuned. — [Models](https://docs.typesafe.ai/models)
- **Rate limits and overload.** Limits are per organization, in tokens per second and requests per second, with values only in the console. Responses are 429 or 529 (overloaded). The SDK retries with exponential backoff. — [Models](https://docs.typesafe.ai/models); [Errors](https://docs.typesafe.ai/api/errors)
- **Explainability.** Jev "returns probabilities but no rationale, which is a problem for debugging and regulated audits". It is "Weak when a question bundles several judgments, lacks necessary information, or needs long-form reasoning", and "Doesn't call tools itself." — [DataCamp](https://www.datacamp.com/blog/system-one-models-jev); [DigitalOcean](https://www.digitalocean.com/resources/articles/what-is-jev)
- **"Can't hallucinate" claim.** The vendor says Jev "can't hallucinate" and "never makes type errors". The schema-conformance part is "mathematically guaranteed". The docs themselves say "Typed output guarantees the interface, not truth." — [Launch blog](https://typesafe.ai/blog/introducing-system-one-models-and-jev); [Agent skill](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md)

### Inferences
- **Snapshot size.** A 200-element snapshot is within limits. Element lines are compact (roughly 3–8k tokens), well under 32k per question. But the "large irrelevant state" warning means the best results likely come from filtering first: visible or in-viewport elements, the relevant form or section, and dropping hidden or decorative nodes. Pages with more than 255 interactive elements need a two-pass window approach, by region or landmark then element.
- **Option order.** DOM-order options combined with the documented first-option bias could favor top-of-page elements. For risky clicks, a second call with shuffled or reversed option order, run concurrently, is a cheap consistency check.
- **Prompt injection.** Page text is untrusted. Hostile page content could steer Jev's element choice or "task done" verdict, exactly as the docs warn. Keep destructive actions (purchase, submit, delete) behind higher thresholds or an LLM or human confirmation.
- **What Jev cannot supply.** Jev cannot produce strings to type, URLs to visit, or plans. Those stay with the LLM or come from the user's task text, which code can split into candidates for Jev to choose among.
- **Replay verification.** Probabilities are stable but not bit-identical, so replay verification should gate on thresholds with margins rather than exact equality. Pin `jev-1.13.0` or `jev-1.14.0` rather than `jev-latest`.
- **Screenshots.** Screenshots would need downscaling: a 1920×1080 viewport becomes at most 1568×882. As an experimental feature, they are best treated as a fallback for canvas or icon-only UIs, not a primary path.

### Gaps
- No documented accuracy numbers for images or Box on UI screenshots, and no image token-cost estimates.
- No list of failure modes for jev-1.14 specifically.
- Server-side determinism on byte-identical requests is not documented: no seed, and the cookbooks could not separate that effect.
- Concrete per-organization rate-limit values and any free tier are not public.
