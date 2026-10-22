# Fast, Reliable LLM Browser Agents: Architectures, Caching, Small-Model Techniques, Verification, Benchmarks (external landscape, as of Oct 2026)

Scope note: this file covers the external landscape only (not TypeSafe or the FastPilot code). Dates are given per finding. Many headline numbers are vendor-reported on vendor harnesses; those are marked. Model names in 2026 leaderboards (e.g. "GPT-6.1 Sol", "Claude Opus 5.5") are reproduced as the source lists them.

## 1. Planner–executor / System 1–System 2 splits: who uses a big model to plan and small models or code to ground, act, or verify, and what did it buy them?

### Takeaway
Nearly every strong web agent since 2024 splits planning from acting and adds an explicit validator. The validator step is often the single biggest accuracy gain (Skyvern: +17 points). Latency is dominated by the big-model planning and reflection calls (75–94% of task time in one OSWorld study). The fastest systems cut big-model calls per task, keep outputs terse, prefer text DOM over screenshots, and run small specialized models for grounding. Small models work well as actors and grounders. As validators they cost accuracy unless trained for the job.

### Cited Findings
**Planner / executor / validator designs**
- **Skyvern 2.0** (Jan 16 2025, updated Sep 30 2026) built up its architecture in measured steps on WebVoyager. Skyvern 1.0 was a single prompt in a loop and scored ~45%. Adding a planner, which breaks the goal into sub-goals and keeps a working memory of completed and pending work, raised it to ~68.7%. Adding a validator, which checks whether each goal was achieved and reports errors back to the planner, raised it to 85.85%. The models were GPT-4o and GPT-4o-mini, and the role-to-model assignment is not disclosed. The post reports no latency or cost figures. — [Skyvern blog](https://www.skyvern.com/blog/skyvern-2-0-webvoyager-benchmark-results/)
- **Agent-E** (Emergence AI, arXiv 2407.13032, Jul 2024; NeurIPS 2024 workshop) has two tiers.
  - A planner splits the task into subtasks. A browser-navigation agent executes each subtask and reports success or failure back, so the planner never sees noisy DOM.
  - The navigator uses "DOM distillation": it picks a text-only, input-fields, or all-fields DOM view per subtask.
  - "Change observation" checks whether the page actually changed after an action.
  - It scored 73.2% on WebVoyager, 20% above the prior best text-only agent and 16% above the best multimodal one.
  - On the later human-judged Online-Mind2Web it scored only 28.0%.
  - Sources: [arXiv](https://arxiv.org/html/2407.13032v1); [Online-Mind2Web paper](https://arxiv.org/html/2504.01382v4)
- **Plan-and-Act** (Erdogan et al., ICML 2025, arXiv 2503.09572) uses a separate planner model and executor model. The planner is trained on synthetic plans that an LLM reverse-engineers from successful trajectories. It reports 57.58% on WebArena-Lite and a text-only 81.36% on WebVoyager (v3). An earlier version reported 53.94%. — [arXiv v3](https://arxiv.org/html/2503.09572v3)
- **AgentOccam** (Amazon, arXiv 2410.13825, Oct 2024; ICLR 2025) adds no extra roles. It only aligns the observation and action spaces with what LLMs handle well: pruned observations and a simplified action set. It reports +9.8 absolute points over the prior WebArena SOTA, +5.9 over a concurrent method, and +26.6 points over a comparable vanilla agent. It uses no in-context examples, new agent roles, online feedback, or search. — [arXiv](https://arxiv.org/html/2410.13825v1)
- **Magentic-One** (Microsoft, Nov 2024) has an Orchestrator that plans, tracks progress, and re-plans, plus specialist agents. The WebSurfer specialist acts via the browser's accessibility tree. Secondary write-ups give GAIA ~38%, WebArena 32.8%, and AssistantBench 27.7%; I did not verify these against the paper table. — [InfoQ](https://www.infoq.com/news/2024/11/microsoft-magentic-one); [AutoGen docs](https://microsoft.github.io/autogen/0.7.3/user-guide/agentchat-user-guide/magentic-one.html)
- **Surfer-H + Holo1** (H Company, arXiv 2506.02865, Jun 2025) is a policy / localizer / validator agent with small open-weight Holo1 models.
  - Holo1-7B reaches 92.2% on WebVoyager at ~$0.13 per task, versus 92.0% at $0.54 with GPT-4.1. The reported numbers allow up to 10 attempts.
  - Holo1-3B: 89.7% at ~$0.11. GPT-4.1-mini: 88.8% at ~$0.26. GPT-4o: 84.3% at $0.71.
  - Holo1 costs are internal estimates.
  - Swapping the validator to Holo1 cuts accuracy by ~12–16 points, so the reported setups keep a GPT-4o validator.
  - Sources: [H Company](https://hub.hcompany.ai/models/Holo1/aboutholo1); [landing page](https://lp.hcompany.ai/surfer-h); [summary](https://hyper.ai/papers/2506.02865)
- **Agent S2** is the agent studied in OSWorld-Human. It splits a GPT-4.1 planner, reflection, and retrieval model from a UI-TARS-7B-DPO grounding model. Planning plus reflection LLM calls were 75–94% of total task latency. Planning alone was 48.9–59.2% and reflection 15.9–45.2% per application. — [OSWorld-Human, arXiv 2506.16042](https://arxiv.org/html/2506.16042v1)

**Frontier "computer-use" models (single big model, vision-first)**
- **OpenAI CUA / Operator** (Jan 2025): WebArena 58.1%, WebVoyager 87%, OSWorld 38.1%. It was later folded into ChatGPT Agent. — [OpenAI](https://openai.com/mt-MT/index/computer-using-agent/); [Particula](https://particula.tech/blog/browser-use-vs-operator-vs-claude-computer-use-web-agents)
- On human-judged Online-Mind2Web (2025), Operator scored 61.3% but took ~2.6x the human reference steps and up to 44 minutes on hard tasks. — [Online-Mind2Web paper](https://arxiv.org/html/2504.01382v4)
- **Gemini 2.5 Computer Use** (Oct 7 2025) scored 69.0% pass@1 on official Online-Mind2Web and 65.7% on Browserbase's harness. Google claims lower latency than alternatives, with ~225 s median latency per task on the Browserbase harness (Google-reported, via secondary coverage). — [Google blog](https://blog.google/technology/google-deepmind/gemini-computer-use-model/); [MarkTechPost](https://www.marktechpost.com/2025/10/08/google-ai-introduces-gemini-2-5-computer-use-preview-a-browser-control-model-to-power-ai-agents-to-interact-with-user-interfaces/)
- **Amazon Nova Act** (preview 2025; Dec 2025 announcement) breaks workflows into "atomic" `act()` commands for reliability.
  - Amazon claims ~90% reliability on early-customer UI workflows.
  - Amazon-internal grounding scores: ScreenSpot Web Text 0.939, Web Icon 0.879, GroundUI Web 0.805.
  - I found no published latency numbers.
  - Sources: [Business Wire](https://www.businesswire.com/news/home/20251202403382/en); [AWS docs](https://docs.aws.amazon.com/nova-act/latest/userguide/what-is-nova-act.md); [ithome](https://www.ithome.com.tw/news/168187)

**Speed-first DOM agents**
- **Browser Use BU 1.0 / ChatBrowserUse** (Oct 8–9 2025, vendor-reported):
  - Average task time on OnlineMind2Web: 68 s, versus 225 s for Gemini 2.5 CU, 285 s for Claude Sonnet 4.5, 295 s for Sonnet 4, and 330 s for the OpenAI CUA model.
  - Accuracy is similar at ~65%. Speed is ~3 s per step, or "20 steps per minute".
  - Latency is measured as pure LLM inference time, and the speedup claims are inconsistent (6x / 4x).
  - Techniques:
    - Put agent history before the browser state so the KV/prompt cache hits.
    - Use the text DOM first and take screenshots only when needed; each screenshot adds ~0.8 s.
    - Run a separate `extract` LLM call on pages with 20k+ tokens, so the main context stays small.
    - Keep actions terse, 10–15 output tokens each.
  - Measured token timing: 1,000 input tokens take 29.1 ms, while 10 output tokens take 62.6 ms.
  - Sources: [speed-matters](https://browser-use.com/posts/speed-matters); [llm-gateway](https://browser-use.com/posts/llm-gateway)
- **Browser Use Bench v2.1** (Oct 17 2026, vendor-run, 180 long live tasks; score / cost per task / median time):
  - GPT-6.1 Sol medium: 79.6 / $1.30 / 8 min
  - Claude Opus 5.5 high: 75.0 / $2.35 / 12 min
  - DeepSeek V4.1 Flash low: 74.0 / 12¢ / 12 min (time not comparable)
  - Browser Use "BU fast": 72.9 / 11¢ / 9 min
  - Claude Haiku 5.5 high: 64.3 / 23¢ / 9 min
  - Claude Haiku 5.5 low: 45.6 / 2.7¢ / 2 min
  - Costs exclude browser and judge. 95% ranges overlap heavily.
  - Source: [Browser Use benchmarks](https://browser-use.com/benchmarks/agents)

**Step-level cascade: small policy by default, large model on evidence**
- "Step-level Optimization for Efficient Computer-use Agents" (Yale, Apr 29 2026, arXiv 2604.27151):
  - A small GUI policy runs every step. A large model takes over only when a stuck monitor or a milestone monitor fires.
  - Both monitors are ModernBERT-base classifiers (149M parameters), trained on logged trajectories labeled by GPT-5.2.
  - The routing policy uses hysteresis and bounded recovery budgets to avoid thrashing between models.
  - Results:

    | Benchmark | Configuration | Latency/req | Cost/task | Success |
    |---|---|---|---|---|
    | OSWorld | Kimi K2.5 alone | 8.3 s | $0.132 | 60.1% |
    | OSWorld | EvoCUA-8B + Kimi | 4.5 s | $0.051 | 58.2% |
    | OSWorld | Claude Sonnet 4.5 alone | 6.4 s | $0.881 | 58.1% |
    | OSWorld | EvoCUA-8B + Claude | 4.1 s | $0.224 | 55.4% |
    | WebArena | GPT-5.2 alone | 19.6 s | $0.335 | 60.1% |
    | WebArena | AgentTrek-32B + GPT-5.2 | 13.4 s | $0.208 | 58.8% |
    | WebArena | gpt-oss-20b + GPT-5.2 | 12.2 s | $0.211 | 57.8% |

  - The abstract claims up to 74.6% lower cost and 45.8% lower latency.
  - Source: [arXiv](https://arxiv.org/html/2604.27151)

### Inferences
- The consistent pattern is a strong model for decomposition and verification, with cheap execution and grounding. Skyvern's +17 points came from the validator, not the actor. Surfer-H shows small actors are fine but small validators are not, unless purpose-trained. For FastPilot, a small typed-judgment model is safest first as a monitor or router (stuck / milestone / done-probability) that decides when to call the big model. Replacing the final success verdict should come later.
- Browser Use's numbers support FastPilot's existing direction: text snapshots instead of screenshots, terse batched actions, and cache-friendly prompt layout. The remaining big lever is the number of big-model calls per task.
- The Yale cascade shows event-driven escalation beats periodic escalation. On OSWorld it scored 58.2% at $0.05 versus 55.1% at $0.07; on WebArena, 58.8% at $0.21 versus 52.5% at $0.24 ([arXiv](https://arxiv.org/html/2604.27151)). This argues for escalation driven by calibrated probabilities rather than "re-plan every N steps".

### Gaps
- Skyvern, Magentic-One, and Plan-and-Act do not publish per-role latency or cost breakdowns.
- I found no primary, independently measured latency numbers for Project Mariner, Nova Act, or Claude for Chrome.
- Magentic-One's exact benchmark numbers were only found in secondary sources.
- I did not cover the newest 2026 frontier computer-use model releases in detail beyond leaderboard positions (Section 5).

## 2. Caching and reuse: action/plan caching, workflow memory, self-healing selectors, parameterized replay, trace-to-script compilation. How do systems decide a cached plan applies, and how do they handle drift?

### Takeaway
Production systems cache at the action or block level, not the task-text level. They key on normalized URL plus a DOM fingerprint plus the method and its arguments, with values abstracted into variables. Each replay is gated by a passive page-equivalence check. On mismatch or failure they fall back to the live agent and rewrite the cache. Research systems (AWM, ASI, AgentRR, Skim) go further: they abstract trajectories into parameterized workflows or verified programs, choose replay granularity by how closely the context matches, and attach postcondition or check functions. Their recurring lesson: "a wrong cached click is worse than a slow click."

### Cited Findings
- **Stagehand caching** (Browserbase blog, Feb 24 2026)
  - What is cached: a resolved selector per atomic action (act / extract), not whole runs.
  - Cache key: method + normalized URL + DOM hash + project scope + method-specific fields, with nested options such as schema hashed, all serialized and hashed with SHA-256.
  - Matching: a passive comparison of the current page-snapshot fingerprint against the recorded one. If it clears a safety threshold, the cached selector runs with no LLM call.
  - Drift: the request becomes a miss, runs normally, and writes a new entry. The entry is never forced.
  - Variables: placeholders such as `%email%` let one entry serve runs that differ only in values.
  - Lifetime: entries are project-scoped, stored server-side, and valid for 48 hours.
  - Speedup: "as high as ~80%" from run 1 to run 2. No hit rates are published.
  - Known limits: pages that render differently each load, randomized URLs, and meaningful changes not visible in the DOM.
  - Stance: accuracy over hit rate; "A wrong cached click is worse than a slow click."
  - Source: [Browserbase blog](https://browserbase.com/blog/stagehand-caching)
- **Stagehand v4 docs**: the cache covers act(), observe(), and extract(). Model config is excluded from the key, so switching models does not invalidate the cache. Cached act() replays deterministically with self-healing off, and falls back to full inference if the recorded selector no longer resolves. — [Stagehand v4 caching docs](https://docs.stagehand.dev/v4/best-practices/caching)
- **Stagehand v3** (Oct 2025) talks to the browser directly over CDP. It is 44.11% faster on iframe and shadow-root interactions, and the changelog claims 20–40% faster act/extract/observe overall. — [Browserbase v3 post](https://browserbase.com/blog/stagehand-v3); [changelog](https://browserbase.com/changelog/page/3/)
- **Skyvern code caching** (docs, 2025–26)
  - The first run uses `run_with="agent"`. The completed run's actions are compiled into reusable Playwright-style code.
  - Later runs use `run_with="code"`: no screenshots and no LLM.
  - If the page changes and the code breaks, "AI Fallback" (on by default) reruns the agent and regenerates the cache.
  - Tasks cache the full action sequence; workflows cache per block.
  - Conditional, wait, and code blocks always run live because they depend on runtime state.
  - Source: [Skyvern docs](https://skyvern.com/docs/developers/features/code-caching)
- **Browser Use workflow-use** ("Deterministic, Self Healing Workflows (RPA 2.0)")
  - Creation: record a demo, or describe a task and run Browser Use once ("generation mode"). An LLM converts the result into a workflow with input variables. Reruns need no LLM.
  - Failure handling: a failed step falls back to Browser Use. The README admits LLM fallback is "currently really bad", and self-healing (an agent updating the workflow file) is an unchecked roadmap item.
  - Maturity: "very early development", not for production.
  - Source: [README](https://cdn.jsdelivr.net/gh/browser-use/workflow-use@main/README.md)
- **Agent Workflow Memory (AWM)** (CMU/MIT, arXiv 2409.07429, ICML 2025)
  - Workflows are induced from past trajectories with values abstracted into variables (e.g. `{product-name}`). Each step stores a state description, reasoning, and an executable action.
  - WebArena (GPT-4): 35.5% versus 23.5% for BrowserGym, a 51.1% relative gain. AWM averaged 5.9 steps versus 7.9 for the ax-tree baseline, and beat human-written workflows (SteP, 33.0%).
  - Mind2Web cross-task step SR: 45.1 versus 36.2 (MindAct).
  - Failure modes:
    - Agents over-follow workflow steps irrelevant to the current state; action F1 was 57.3 versus 60.6.
    - Dynamic pop-ups (e.g. airport suggestions) are not handled by scripted steps.
    - Online induction from incorrect trajectories adds noise.
  - When workflows were exposed as callable actions (AWM_AS), the agent used them in only 18.5% of tasks.
  - Sources: [arXiv](https://arxiv.org/html/2409.07429v1); [ICML](https://proceedings.mlr.press/v267/wang25bx.html)
- **Agent Skill Induction (ASI)** (CMU, arXiv 2504.06821, COLM 2025) induces skills as executable Python programs and verifies them by execution before saving them.
  - Success rate: +23.5% over the static baseline and +11.3% over text-skill memory on WebArena.
  - Steps: 10.7–15.3% fewer.
  - Skills transfer across websites and can be updated when sites change.
  - Source: [arXiv](https://arxiv.org/abs/2504.06821)
- **AgentRR** (SJTU IPADS, arXiv 2505.17716, May 2025) records traces and summarizes them into multi-level "experiences".
  - Low-level experiences are exact action sequences, used when the context closely matches.
  - High-level experiences are generalized procedures, used when the context differs.
  - Each experience has a generated "check function" that acts as a trust anchor during replay.
  - No numbers were found in the abstract.
  - Source: [arXiv](https://arxiv.org/abs/2505.17716)
- **Skim: Speculative Execution for Fast and Efficient Web Agents** (Wong, Hsieh, Nath, Netravali, arXiv 2605.16565, May 2026)
  - An offline profiler records per-site URL patterns, answer formats, and task-to-trajectory mappings.
  - At run time a query is matched to a site template. Skim synthesizes the destination URL directly, and a small model extracts the answer.
  - A lightweight verifier gates the output against the query and schema. Misspeculations cascade to the full agent, warm-started at the fast path's final URL.
  - Results across WebVoyager, AgentOccam, and BrowserUse backbones: median per-task cost 1.9x lower and latency 33.4% lower, "with no accuracy loss".
  - Source: [arXiv](https://arxiv.org/abs/2605.16565)
- **Skyvern 2.0 future-work note** (Jan 2025): "better memorize things it has already done in the past so it can do them again at a lower price point." Code caching above was the follow-through. — [Skyvern blog](https://www.skyvern.com/blog/skyvern-2-0-webvoyager-benchmark-results/)

### Inferences
- FastPilot keys saved runs on exact task text. Every external system keys on something more semantic. Stagehand uses method, normalized URL, and DOM hash, plus variables. AWM and workflow-use use an abstract workflow with variables. Skim uses a site template matched from the query. A typed-judgment small model fits well at two points:
  1. Deciding "does this new task match saved workflow W, and with which variable bindings?" (classification plus extraction with a probability).
  2. Deciding "is the current page equivalent enough to the recorded page for step k?" as a gate, instead of a pure hash threshold.
- Multi-level replay (AgentRR) plus warm-started fallback (Skim) is the most transferable drift strategy:
  - Exact replay when the fingerprint matches.
  - Workflow-as-hint to the planner when the match is partial.
  - Full agent otherwise, starting from the last verified state rather than from scratch.
- Per-step postconditions (AgentRR check functions, Agent-E change observation) make replay safe. Each cached step should carry an expected-change assertion that deterministic code or a small model can check.
- AWM's "over-following" and AWM_AS's low adoption suggest workflows given as hints get ignored or misapplied. Deterministic replay with gates is more predictable than "put workflows in the prompt".

### Gaps
- No system publishes cache hit rates, false-hit (wrong replay) rates, or drift frequency on real sites. Stagehand's "~80%" is a best-case per-action speedup.
- How Stagehand computes its "safety threshold" for DOM-fingerprint similarity is not disclosed.
- I found no public data on how cached replay behaves under A/B tests specifically.

## 3. Small-model techniques: element ranking and grounding, DOM pruning, speculative or parallel actions, early-exit verification, confidence-gated escalation, cascades and routing. What latency and cost numbers are reported?

### Takeaway
Small models are proven for:
- Element shortlisting. A fine-tuned DeBERTa ranker reached ~85–89% recall@50 on Mind2Web, but recall drops under domain shift.
- Grounding. Prune4Web-3B lifted sub-task grounding from 46.8% to 88.3% after 25–50x candidate pruning.
- Step-level routing monitors. 149M-parameter classifiers cut cost by up to ~75%.
- Speculation. Small models guess the next action or answer and commit only on exact match or verification.

Gains from speculation alone are modest: up to 20% latency. Gains from template or fast-path speculation with a verifier are larger: 33% latency and 1.9x cost. Classic cascades (FrugalGPT) show the ceiling: up to 98% cost reduction on text tasks.

### Cited Findings
- **MindAct (Mind2Web, 2023)** shortlists elements with a fine-tuned DeBERTa-v3-base (86M) ranker before an LLM picks the action. Reported Recall@50: 88.9% cross-task, 85.3% cross-website, 85.7% cross-domain. These figures come from an aggregator; verify them against the paper. — [aiwiki summary](https://www.aiwiki.ai/wiki/mind2web); [Liner review](https://liner.com/review/mind2web-towards-a-generalist-agent-for-the-web)
- **Small rankers under domain shift** (arXiv 2609.27770, Aug 2026; research done in 2023):
  - DeBERTa and T5 rankers trained on Mind2Web and transferred to WebArena raised a LLaMA-2-70B agent only from 1.97% to 2.96% success.
  - A zero-shot ColBERT retriever recalled the ground-truth element 0.52 of the time on Mind2Web and 0.47 on WebArena.
  - A separate retrained DeBERTa had 81% top-10 recall on Mind2Web but 0.63 recall on WebArena.
  - Sources: [arXiv 2609.27770](https://arxiv.org/abs/2609.27770); [search summary of related work](https://huggingface.co/torontodeveloper/mind2web-candidate-ranker)
- **Prune4Web** (arXiv 2511.21398, AAAI 2026) has an LLM write Python scoring programs that filter the DOM, which typically runs 10k–100k tokens.
  - Candidate elements shrink 25–50x before a grounder picks the action.
  - Low-level sub-task grounding accuracy rose from 46.80% to 88.28%. A unified 3B model reaches 58.4% element accuracy on Multimodal-Mind2Web.
  - Training used ~5k trajectories.
  - Source: [arXiv](https://arxiv.org/pdf/2511.21398)
- **Region4Web / PageDigest** (arXiv 2605.07134, May 2026) reorganizes the AX tree into functional regions and keeps a per-page digest across steps. It "substantially reduces observation length" and improves WebArena success across backbones; the abstract gives no figures. — [arXiv](https://arxiv.org/abs/2605.07134)
- **Speculative Actions** (Columbia, arXiv 2510.04371, Oct 2025; ICLR 2026) has faster models predict next actions and execute them in parallel, committing only on a match. Up to 55% next-action prediction accuracy gives up to 20% latency reduction across web search, gaming, and e-commerce. Selective branch launching limits cost. — [arXiv](https://arxiv.org/html/2510.04371v1); [ICLR](https://iclr.cc/virtual/2026/oral/10009727)
- **Speculate with Memory** (Salesforce, arXiv 2607.12236, Jul 2026)
  - A GPT-4.1-mini speculator predicts the next action or observation while the environment is busy. It is helped by online memories: a transition table, episodic misses, and a confusion tracker.
  - Speculation is restricted to read-only or repeatable operations via allowlists. A result is used only on exact match of action type and all arguments.
  - Prediction accuracy improved on WebArena from 19.8% to 23.7% and on VisualWebArena from 12.5% to 17.4%.
  - The one live end-to-end speedup reported, on HotpotQA, was only ~1.05x. The benefit depends on environment delay.
  - Source: [alphaXiv](https://www.alphaxiv.org/abs/2607.12236)
- **Skim** (May 2026), described in Section 2: template fast path plus small extractor plus lightweight verifier, giving 1.9x lower median cost and 33.4% lower latency with no accuracy loss. A search snippet of the full paper also cites median per-step delays of ~4.7 s for LLM inference and ~6.6 s for browser actions; I did not verify this in the abstract. — [arXiv](https://arxiv.org/abs/2605.16565)
- **Step-level cascade** (Yale, Apr 2026), described in Section 1: ModernBERT stuck and milestone monitors gate escalation.
  - The paper reports up to 74.6% lower cost and 45.8% lower latency.
  - EvoCUA-8B + Kimi K2.5 cost 61.4% less than Kimi alone, with success 58.2% versus 60.1%.
  - Detector accuracy: milestone 94.1% accuracy / 62.0% F1; stuck 93.9% accuracy / 91.5% F1.
  - Ablation: no detector 43.3, stuck only 49.7, milestone only 52.1, both 53.2.
  - Source: [arXiv](https://arxiv.org/html/2604.27151)
- **FrugalGPT** (May 2023) uses an LLM cascade with a learned scorer that decides when to stop or escalate. It can "match the performance of the best individual LLM (e.g. GPT-4) with up to 98% cost reduction" or "improve the accuracy over GPT-4 by 4% with the same cost" (text tasks). — [arXiv](https://arxiv.org/abs/2305.05176)
- **Confidence-gated cascade, non-agent example** (2026, educational scoring): small-model confidence thresholding cut cost by 76% and median latency by 61% versus always-large, with negligible agreement change. — [arXiv 2604.19781](https://arxiv.org/pdf/2604.19781)
- **Action grouping** (OSWorld-Human, 2025): grouping consecutive actions that can run on one observation cut LibreOffice Calc from 13.6 single-action steps to 5.9 grouped steps. Generating an accessibility tree alone took 3–26 s per step. Later steps took ~3x longer than early ones because prompts grow with history. — [arXiv](https://arxiv.org/html/2506.16042v1)
- **Output-token economics** (Browser Use, Oct 2025): 1,000 input tokens take 29.1 ms; 10 output tokens take 62.6 ms. Terse 10–15-token actions and cached history prefixes are the main per-step levers. — [Browser Use](https://browser-use.com/posts/speed-matters)

### Inferences
- For FastPilot (already text-snapshot and batched), the highest-value small-model roles are:
  1. Element shortlisting or pruning. Send only the top-k candidates plus a compact page digest to the big model. Keep a fallback to the full snapshot when the small model's top-1 probability is low, because recall falls sharply off-distribution.
  2. Escalation gating with calibrated probabilities (stuck / progress / done), with hysteresis.
  3. Safe speculation of read-only steps, such as pre-extracting likely answers or prefetching likely next-page snapshots, committed only on match.
- Pure next-action speculation yields ~5–20% wall-clock. Template or fast-path approaches (Skim) and replay (Section 2) give larger wins because they remove whole big-model calls.
- Since browser actions and settling may take as long as or longer than inference (the unverified 6.6 s vs 4.7 s per step), FastPilot's settle detection is a co-equal latency lever. Speculating on observations during settle waits is the overlap opportunity.

### Gaps
- I found no published per-step latency for a small-model element ranker inside a production browser agent.
- No head-to-head study compares a typed-probability small classifier against an LLM call for "did this action succeed?" on live web tasks.
- The FrugalGPT-style 98% figure is from text QA, not agents.

## 4. Verification and completion detection: how do agents decide an action succeeded or the task is done without an expensive call? How are judges, critics, and reward models used?

### Takeaway
The best results come from explicit verification.
- Skyvern's validator added +17 points.
- Online-Mind2Web's WebJudge reaches ~85–87% agreement with humans, and a 7B judge matches o4-mini.
- Web-Shepherd, a checklist-based process reward model, gives +10.9 points at 10x lower cost than an LLM verifier.

Cheap paths include:
- Deterministic change observation and postconditions (Agent-E, AgentRR check functions, Stagehand passive DOM checks).
- Small trained classifiers that trigger the expensive verifier only at milestones (Yale cascade).

Final-answer hallucinations are the main source of false "done" verdicts.

### Cited Findings
- **Skyvern validator** (Jan 2025) checks whether planned goals were achieved and returns errors to the planner. It took WebVoyager from 68.7% to 85.85%. — [Skyvern](https://www.skyvern.com/blog/skyvern-2-0-webvoyager-benchmark-results/)
- **Surfer-H** (Jun 2025): replacing the GPT-4o validator with small Holo1 lowers accuracy ~12–16 points. — [hyper.ai summary of arXiv 2506.02865](https://hyper.ai/papers/2506.02865)
- **WebJudge** (Online-Mind2Web, arXiv 2504.01382, COLM 2025, v4 Oct 2025)
  - Agreement with humans: ~85%. Averages are 83.6% with GPT-4o and 85.7% with o4-mini, and the fine-tuned WebJudge-7B reaches 87%.
  - The o4-mini judge has a 3.8% success-rate gap versus humans.
  - Older evaluators score lower: WebVoyager's judge 73.9 (GPT-4o), AgentTrek Eval 66.9.
  - Sources: [GitHub](https://github.com/OSU-NLP-Group/Online-Mind2Web); [arXiv](https://arxiv.org/abs/2504.01382)
- Careerflow, the human-eval partner, says WebJudge still runs "6 to 10%" off the true success rate. — [Careerflow](https://www.careerflow.ai/human-data/online-mind2web)
- A Qwen3.5-27B WebJudge-style evaluator reaches 86.0% agreement with a 9.3% false-negative rate. — [StructAgent arXiv 2607.11388](https://arxiv.org/pdf/2607.11388)
- **Why judges fail**: agents' final responses often contain hallucinations that produce false positives, one reason WebVoyager-style auto-evaluation is over-optimistic. — [Online-Mind2Web paper](https://arxiv.org/html/2504.01382v4)
- **Web-Shepherd** (arXiv 2505.15277, May 2025) is a checklist-based process reward model.
  - It decomposes the instruction into subgoals and scores each step. It was trained on 40K step-level preference pairs.
  - With GPT-4o-mini as policy and Web-Shepherd as verifier on WebArena-lite: +10.9 points at 10x less cost than GPT-4o-mini as verifier.
  - It scores ~30 points higher than GPT-4o on WebRewardBench.
  - The authors estimate GPT-4o tree search on WebArena's 812 tasks at ~$14,000.
  - Sources: [arXiv](https://arxiv.org/html/2505.15277v2); [HF](https://huggingface.co/papers/2505.15277)
- **WebArbiter** (2026) argues checklist PRMs rely on brittle template matching that fails when layouts change. It claims its 7.6B model beats GPT-5 by 9.1 points and WebShepherd-8B by 31 points on WebPRMBench (self-reported). — [featherless model card](https://featherless.ai/models/ZYao720/WebArbiter-7B); [mind-verse summary](https://mind-verse.de/news/webarbiter-belohnungsmodell-automatisierung-web-agenten)
- **Event-driven verification beats periodic** (Yale, Apr 2026). The milestone monitor triggers a stronger verifier that checks progress validity and intent consistency using before/after state. On OSWorld this scored 58.2% at $0.05 versus 55.1% at $0.07 for periodic; on WebArena, 58.8% at $0.21 versus 52.5% at $0.24. — [arXiv](https://arxiv.org/html/2604.27151)
- **Deterministic or cheap checks**
  - Agent-E "change observation": verify the page changed as intended after each action. — [arXiv](https://arxiv.org/html/2407.13032v1)
  - AgentRR per-experience "check functions". — [arXiv](https://arxiv.org/abs/2505.17716)
  - Stagehand passive DOM-fingerprint equivalence before replay. — [Browserbase](https://browserbase.com/blog/stagehand-caching)
  - Skim's "lightweight verifier" gates fast-path answers against query and schema. — [arXiv](https://arxiv.org/abs/2605.16565)
- **Browser Use judge** checks both the screenshot and the DOM state at each step, so DOM-based agents aren't scored unfairly by screenshot-only judges. — [Browser Use](https://browser-use.com/posts/speed-matters)
- **Failure trajectories are long**: on Online-Mind2Web, failed tasks took nearly twice as many steps as successful ones for Browser Use, Claude CU 3.7, and Operator. — [Online-Mind2Web paper](https://arxiv.org/html/2504.01382v4)

### Inferences
- A tiered verifier stack transfers well to FastPilot:
  - Tier 0: deterministic postconditions (URL, DOM diff, network status, expected element appeared or disappeared).
  - Tier 1: a small typed classifier giving P(step succeeded), P(stuck), and P(task done).
  - Tier 2: the big model or a WebJudge-style judge only when Tier 1 is uncertain or a milestone or final answer is reached.
- Because failures take ~2x the steps, an early "stuck" detector is a direct latency win.
- Final "done" verdicts should require evidence from page state, not just the agent's claim, because hallucinated final answers are the dominant false positive.
- Checklist decomposition (Web-Shepherd) maps naturally to a planner emitting typed subgoals, each checked by a small model.

### Gaps
- I found no published latency figures for WebJudge-7B or Web-Shepherd per call.
- There is no data on how well small-model "done" detectors are calibrated on live sites.

## 5. Benchmarks and metrics for speed as well as success: what do WebArena, Online-Mind2Web, WebVoyager, BrowseComp, OSWorld, REAL, etc. report about steps, wall-clock time, and cost, and which suit measuring a FastPilot redesign?

### Takeaway
WebVoyager is saturated (top ~99%) and shortcut-prone, so it is not a good target. Online-Mind2Web (300 tasks, 136 live sites, human or WebJudge evaluation, step-efficiency analysis) is the most credible live-web benchmark. REAL (deterministic clones of 11 popular sites) suits reproducible A/B and regression testing, including replay. OSWorld-Human introduced an efficiency-weighted success metric (WES+) that sharply re-ranks agents. Only Browser Use Bench routinely publishes cost per task and median time alongside score, and it is vendor-run.

### Cited Findings
- **WebVoyager** (643 live tasks, 15 sites)
  - Top Steel leaderboard entries as of Oct 11 2026: 99.19% (browser-control with Fable 5), 98.5% (Alumnium), 97.1% (Surfer 2). — [Steel leaderboard](https://leaderboard.steel.dev/)
  - A naive Google-search agent solves 51% of sampled WebVoyager tasks.
  - Its auto-judge has low agreement with humans.
  - Source: [Online-Mind2Web paper](https://arxiv.org/html/2504.01382v4)
- **Online-Mind2Web** (300 tasks, 136 sites; COLM 2025)
  - Human-judged success rates (2025): SeeAct 30.7, Agent-E 28.0, Browser Use 30.0, Claude CU 3.5 29.0, Claude CU 3.7 56.3, Operator 61.3. Only Claude CU 3.7 and Operator beat the 2024 SeeAct baseline.
  - Efficiency is measured as agent steps divided by reference steps on successful tasks. Operator runs ~2.6x the human reference.
  - Average success drops 31.6 points from easy to medium tasks.
  - Source: [arXiv](https://arxiv.org/html/2504.01382v4)
- The Steel leaderboard (Oct 2026) lists Browser Use Cloud (bu-max) at 97.0% and GPT-5.4 native CU at 93.0% on Online-Mind2Web. Judges and harnesses differ across entries, and Browser Use says screenshot-only judges don't fit DOM agents. — [Steel](https://leaderboard.steel.dev/); [Browser Use](https://browser-use.com/posts/speed-matters)
- **OSWorld-Human** (UCSD, arXiv 2506.16042, Jun 2025; MLSys 2026)
  - Re-annotates OSWorld with human-determined trajectories.
  - Across 16 agents, the best take 1.4–2.7x more steps than necessary.
  - The Weighted Efficiency Score (WES+) drops Agent S2 + Gemini 2.5 from 41.4% success to 28.2% (single-action) and 17.4% (grouped-action).
  - A line-spacing task took an agent 12 min versus under 30 s for a human.
  - Source: [arXiv](https://arxiv.org/html/2506.16042v1)
- **OSWorld** is now near or above the human baseline (72.36%). Vendor-reported Oct 2026 tops: Qwen3.8-Max 86.1%, Claude Mythos 5 85.0%. The harder OSWorld 2.0 / Verified 2.0 gives much lower scores. — [BenchLM](https://benchlm.ai/benchmarks/osworld-verified); [Steel](https://leaderboard.steel.dev/); [BenchLeader](https://www.benchleader.com/benchmarks/osworld_2)
- **WebArena** (812 self-hosted tasks): top Oct 2026 entries are WebTactix (DeepSeek v3.2) 74.3%, OpAgent 71.6%, ColorBrowserAgent 71.2%. The leaderboard has no speed or cost columns. — [Steel](https://leaderboard.steel.dev/)
- **REAL** (AGI Inc., arXiv 2504.11543, Apr 2025)
  - Deterministic replicas of 11 popular sites (e.g. Amazon, DoorDash, United clones) with 112 tasks.
  - Data, timestamps, and UX are fixed but configurable via URL parameters.
  - Scoring uses programmatic state checks for action tasks plus rubric LLM judging for retrieval tasks.
  - Frontier models reached at most 41% at publication.
  - The SDK is `agisdk`.
  - Sources: [arXiv](https://arxiv.org/pdf/2504.11543v1); [GitHub](https://github.com/agi-inc/agisdk)
- **BrowseComp** (1,266 questions) tests deep search and research. The Oct 2026 top is 92.2%. It is less relevant to transactional browser automation. — [Steel](https://leaderboard.steel.dev/)
- **Browser Use Bench v2.1** (Oct 17 2026): 180 long live tasks, rubric score 0–100, model cost per task (excluding browser and judge), and median time. Vendor-run; full rubric and judge not disclosed. — [Browser Use](https://browser-use.com/benchmarks/agents)
- **WAREX** (arXiv 2510.03285, Sep 2025) injects network instability, server errors, XSS-style attacks, and malicious pop-ups into WebArena, WebVoyager, and REAL. It reports "significant drops" in success; numbers are not in the abstract. — [arXiv](https://arxiv.org/abs/2510.03285)
- **Latency reporting is inconsistent.** Browser Use reports "pure LLM inference time". Google reports median per-task latency on Browserbase's harness. OSWorld-Human reports per-step and per-component latency. — [Browser Use](https://browser-use.com/posts/llm-gateway); [MarkTechPost](https://www.marktechpost.com/2025/10/08/google-ai-introduces-gemini-2-5-computer-use-preview-a-browser-control-model-to-power-ai-agents-to-interact-with-user-interfaces/); [OSWorld-Human](https://arxiv.org/html/2506.16042v1)

### Inferences
- A suitable FastPilot evaluation suite:
  1. REAL (deterministic) for controlled A/B of architectures and for testing replay or cache correctness, since sites can be re-run identically and URL parameters can simulate drift.
  2. A fixed Online-Mind2Web subset with WebJudge-7B or o4-mini judging, plus spot human checks, for live-web generalization.
  3. A private set of the user's own repeated tasks, run multiple times, to measure replay hit rate and false-hit rate.
- Report together: success; wall-clock p50/p90; big-model calls per task; tokens and $ per task; steps divided by reference steps (Online-Mind2Web) or a WES+-style efficiency score; time to first action; cache hit rate; wrong-replay rate; escalation rate.
- WebVoyager headline numbers (and FastPilot results on it) should not be used to claim progress, given saturation and shortcuts.

### Gaps
- No public leaderboard reports standardized wall-clock and cost across agents on the same harness. Browser Use Bench is closest but vendor-run.
- WAREX's per-agent numbers were not available in the abstract.
- I found no benchmark that specifically measures replay or caching robustness under site drift.

## 6. Failure modes and cautions: where small models or cached replay break (dynamic pages, adversarial UI, A/B tests), and how systems guard against it.

### Takeaway
Cached replay breaks on pages that render differently per load, randomized URLs, state changes invisible in the DOM, and unexpected dialogs or pop-ups. Systems guard with passive equivalence checks, scope limits (no caching of conditional or wait blocks), short time-to-live, read-only-only speculation, and automatic fallback to the live agent. Small models break under domain shift (ranker recall falls from ~0.8–0.9 to ~0.5–0.6) and as validators (–12 to 16 points). Adversarial UI is a large, unsolved risk: pop-ups are clicked ~86% of the time, and prompt-injection attack success was still 11.2% after mitigations in Claude for Chrome (Aug 2025).

### Cited Findings
- **Stagehand cache limits** (Feb 2026): pages "that render very differently on each load" miss; randomized or heavily parameterized URLs defeat normalization; some meaningful changes don't appear in the DOM. Mitigation: a cache miss on any drift, 48-hour TTL, and accuracy over hit rate. — [Browserbase](https://browserbase.com/blog/stagehand-caching)
- **Skyvern** never caches conditional, wait, or code blocks because they depend on runtime state, and falls back to the agent and regenerates code on breakage. — [Skyvern docs](https://skyvern.com/docs/developers/features/code-caching)
- **workflow-use**: LLM fallback is "currently really bad", self-healing is unimplemented, and the project is not production-ready. — [README](https://cdn.jsdelivr.net/gh/browser-use/workflow-use@main/README.md)
- **AWM**: over-following irrelevant workflow steps, dynamic pop-up states unhandled, and noisy online induction. Offline and online workflows combined did worse than either alone. — [arXiv](https://arxiv.org/html/2409.07429v1)
- **Speculate with Memory** speculates only on read-only or repeatable operations (allowlists) and commits only on exact match. — [alphaXiv](https://www.alphaxiv.org/abs/2607.12236)
- **Step-level cascade**: GUI routing is hard because difficulty shifts within a task, errors stay latent for many steps, and routing must avoid thrashing. It uses hysteresis and bounded recovery budgets. — [arXiv](https://arxiv.org/html/2604.27151)
- **Small-ranker domain shift**: DeBERTa recall dropped from 81% top-10 on Mind2Web to 0.63 on WebArena, and ColBERT zero-shot recall was 0.47 on WebArena. — [arXiv 2609.27770](https://arxiv.org/abs/2609.27770); [search summary](https://huggingface.co/torontodeveloper/mind2web-candidate-ranker)
- **Small validators**: Holo1 as validator costs 12–16 points. — [hyper.ai](https://hyper.ai/papers/2506.02865)
- **Checklist PRMs** are criticized as brittle when layouts change. — [mind-verse summary of WebArbiter](https://mind-verse.de/news/webarbiter-belohnungsmodell-automatisierung-web-agenten)
- **Pop-up attacks** (Zhang, Yu, Yang; ACL 2025)
  - Adversarial pop-ups in OSWorld and VisualWebArena were clicked ~86% of the time on average and cut task success by ~47%.
  - A "please ignore pop-ups" prompt cut attack success by ≤25% relative.
  - A later in-context defense study reports 91.2% lower pop-up attack success and ≥60.1% lower environmental-injection attack success, at a 3.3% task-success cost.
  - Sources: [ACL Anthology](https://aclanthology.org/2025.acl-long.411); [arXiv 2503.09241](https://arxiv.org/pdf/2503.09241)
- **Prompt injection, Claude for Chrome** (Aug 2025)
  - 123 test cases across 29 attack scenarios. Attack success was 23.6% without mitigations and 11.2% with them in autonomous mode.
  - On browser-specific attacks (hidden form fields, URL text, tab titles), success fell from 35.7% to 0%.
  - Guards: site-level permissions, confirmation before high-risk actions (publish, purchase, share personal data), blocked site categories, and injection classifiers.
  - Sources: [Anthropic](https://www.anthropic.com/news/claude-for-chrome); [Simon Willison critique](https://simonwillison.net/2025/Aug/26/piloting-claude-for-chrome/)
- **WAREX** (Sep 2025): network instability, server errors, XSS, and malicious pop-ups produce "significant drops" in agent success on WebArena, WebVoyager, and REAL. — [arXiv](https://arxiv.org/abs/2510.03285)
- **Benchmark over-optimism**: many agents that looked strong on WebVoyager did not beat the 2024 SeeAct baseline on human-judged Online-Mind2Web. — [arXiv](https://arxiv.org/html/2504.01382v4)

### Inferences
- For FastPilot replay, "exact task text plus element fingerprints" is brittle in both directions: it misses paraphrased tasks, and it can wrongly replay when the page changes in ways fingerprints don't capture. Guards that should be added:
  - Per-step postconditions.
  - Treating modals, pop-ups, and unexpected elements as forced cache misses.
  - Never caching steps whose behavior depends on runtime branches.
  - A confirmation gate for irreversible steps even during replay.
  - Expiring or revalidating entries.
- A/B tests and personalization should be treated as "same URL, different DOM". A page-equivalence classifier plus fallback handles them; hash-only matching does not.
- Small-model judgments need calibration checks on out-of-distribution sites and a low-confidence fallback path, because grounding recall and validator accuracy both degrade off-distribution.

### Gaps
- I found no published measurements of cached-replay failure rates caused by A/B tests or personalization on real sites.
- WAREX's quantified drops were not in the abstract.
- The pop-up attack figure "most agents below 10% success under attack" was only in secondary news and is unverified.

## 7. Transferable design patterns for a FastPilot redesign (synthesis of Sections 1–6)

### Takeaway
The strongest external evidence supports a three-speed architecture:
- **Replay or fast path**: deterministic code gated by page-equivalence and postcondition checks (Stagehand, Skyvern, Skim, AgentRR).
- **Small-model System One**: element shortlisting, step-success, stuck, and done probabilities, and workflow matching (MindAct, Prune4Web, Yale cascade).
- **Big-model System Two**: planning, re-planning, and milestone or final verification, invoked by evidence rather than every step (Skyvern, Plan-and-Act, Yale cascade).

### Cited Findings
- **Event-driven escalation** with small monitors and hysteresis. Cost is up to 74.6% lower and latency up to 45.8% lower, with success close to large-only. — [arXiv 2604.27151](https://arxiv.org/html/2604.27151)
- **Planner plus validator** gives the largest accuracy gains: +23.7 and then +17 points at Skyvern. — [Skyvern](https://www.skyvern.com/blog/skyvern-2-0-webvoyager-benchmark-results/)
- **Semantic cache key** (method + normalized URL + DOM hash + variables), a passive equivalence gate, and miss-on-drift. — [Browserbase](https://browserbase.com/blog/stagehand-caching)
- **Trace-to-code compilation with automatic agent fallback and cache regeneration**; runtime-dependent blocks stay live. — [Skyvern docs](https://skyvern.com/docs/developers/features/code-caching)
- **Multi-level experience and check functions**: exact replay when the context matches, abstract plan when it differs. — [AgentRR](https://arxiv.org/abs/2505.17716)
- **Fast path with verifier gate, warm-started fallback** at the fast path's last URL: 1.9x lower cost and 33.4% lower latency. — [Skim](https://arxiv.org/abs/2605.16565)
- **Parameterized workflows** (variables) induced from successful runs: WebArena 23.5% → 35.5%, with fewer steps. — [AWM](https://arxiv.org/html/2409.07429v1)
- **Execution-verified programmatic skills**: +23.5% success and 10.7–15.3% fewer steps. — [ASI](https://arxiv.org/abs/2504.06821)
- **DOM pruning before grounding**: 25–50x fewer candidates and grounding accuracy 46.8% → 88.3%. — [Prune4Web](https://arxiv.org/pdf/2511.21398)
- **Read-only speculation, exact-match commit**. — [Speculate with Memory](https://www.alphaxiv.org/abs/2607.12236); [Speculative Actions](https://arxiv.org/html/2510.04371v1)
- **Action grouping per observation**: 13.6 → 5.9 steps in one app. Planning and reflection calls are 75–94% of latency. — [OSWorld-Human](https://arxiv.org/html/2506.16042v1)
- **Prompt hygiene for speed**: cache-friendly history prefix, terse actions (10–15 tokens), text DOM first, screenshots only when needed (+0.8 s each), and sub-LLM extraction for huge pages. — [Browser Use](https://browser-use.com/posts/speed-matters)
- **Atomic commands**: break workflows into small, individually reliable `act()` steps. — [Nova Act docs](https://docs.aws.amazon.com/nova-act/latest/userguide/what-is-nova-act.md)
- **Check whether each action actually changed the page** (change observation). — [Agent-E](https://arxiv.org/html/2407.13032v1)

### Inferences
Concrete mapping to FastPilot plus TypeSafe-style typed judgments with probabilities. These are proposals, not tested results.
1. **Task → workflow matcher.** Replace exact-task-text keys with a small-model judgment, e.g. `{matches: workflow_id, p, bindings:{...}}`. Replay only above a high threshold; otherwise pass the workflow to the planner as a hint.
2. **Per-step replay gate.** Before each cached step, combine a deterministic fingerprint check with a small-model `P(page equivalent for step k)`. On low probability, take a forced miss and hand off to the live agent from the current state (warm start).
3. **Postconditions on every step**, recorded at save time (expected URL, element appear or disappear, network 2xx). Evaluate deterministically first and with a small model if ambiguous.
4. **Monitors in the live loop.** Small-model `P(stuck)`, `P(subgoal done)`, and `P(task done)` after each settle. Call the big model only on low progress or high stuck probability, at milestones, or for final confirmation, with hysteresis to avoid thrashing.
5. **Element shortlisting.** A small model ranks snapshot elements for the current subgoal and sends the top-k to the big model. If top-1 confidence is low or the site is unfamiliar, send the full snapshot.
6. **Read-only speculation during settle waits**: pre-extract, or pre-compute the next likely snapshot diff. Commit only on match.
7. **Keep a strong verifier for irreversible actions and final answers.** External evidence says small validators cost accuracy, so use the small model for triage, not as the final authority on high-stakes steps.
8. **Measure with REAL plus an Online-Mind2Web subset plus the user's own repeated tasks.** Report success, p50/p90 wall-clock, big-model calls per task, $ per task, step efficiency, cache hit rate, wrong-replay rate, and escalation rate.

### Gaps
- No external system publishes results for a typed-probability small model used as router, gate, and verifier in a browser agent. Patterns 1–7 are extrapolations from analogous components (ModernBERT monitors, DeBERTa rankers, lightweight verifiers) and should be validated empirically.
