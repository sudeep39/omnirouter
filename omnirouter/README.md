# OmniRouter

OmniRouter makes model selection an explicit, auditable part of an AI application. It routes each request to a configured model tier according to task complexity and supervisor policy, with a path to human support when automation is inappropriate.

In an AI-native application, choosing a model is also a choice about operating cost, response quality and latency. Sending every request to a powerful model can spend unnecessarily on straightforward work. Sending every request to a cheaper model can leave complex questions inadequately answered, creating follow-up requests and extra work for support staff. A conscious routing strategy aims to match capability to the task while accounting for classification overhead, retries and escalation.

OmniRouter demonstrates that architecture. Its purpose is to make the tradeoffs visible and give people control over the decisions. Lower cost alone does not establish success: the response must also be grounded, sufficiently complete and appropriate for the case. This demo does not establish that its tiers predict measured model quality or that routing always saves money.

## Concept presentation

Simulation is the primary experience for this concept demo. A persistent stage banner, grouped navigation, and a short roadmap distinguish the current simulation and supervisor policy exploration from further backend development. Workspace badges identify simulation, local supervisor policy, and the live backend preview.

Simulation results use illustrative cost and assumed quality labels. **Save simulation preferences** saves model selections locally; **Save simulation policy** applies other local policy edits. Backend publication is secondary and collapsed under **Backend configuration: Publish to backend**. Live Support remains available for configured backends and explicitly identifies real calls and provider charges. A local save does not publish a live policy or change the simulator's fixed prices.

## One use case: health-insurance customer support

The demonstration uses Harbor Health, a fictional insurer with a small fictional policy handbook. Its support workload ranges from finding a plan brochure to interpreting interacting policy provisions and reviewing a disputed claim.

Consider two requests:

- "Where can I download my plan brochure?" is a document-navigation task that can be handled by a lower configured tier.
- "My specialist referral expired while authorization was pending, and my claim was denied. What provisions apply, and what information should I provide for a review?" requires more context and careful handling, so it should receive a higher tier and appropriate human oversight.

The intended outcome is to automate routine assistance and give more demanding cases suitable support, reducing avoidable triage and repeat handling by support staff. Reductions in staff workload, repeat contacts and customer dissatisfaction are intended benefits, not measurements produced by this application. It does not make real insurance coverage decisions.

Health-insurance support is one example of a broader concept. The same routing pattern could support IT service desks, document processing, coding assistants, or a notetaker that distinguishes simple transcript summaries from detailed analysis of decisions and action items. Those applications would need their own rules, context, evaluation criteria and escalation policies; they are not implemented here.

## How the concept works

A ticket enters the router, which determines a minimum model tier and whether human handoff is required. The selected tier maps to an explicitly configured provider model. The system records the evidence and policy behind the assignment so that a supervisor can inspect the decision.

| Tier | Demonstrated task category |
| --- | --- |
| TL0 | Document lookup and navigation |
| TL1 | Benefit extraction and plan comparison |
| TL2 | Questions involving interacting provisions, referrals or network rules |
| TL3 | Case-specific coverage interpretation, exclusions and appeals |

These are application-defined capability categories. A tier label is not a provider certification or an independently validated quality ranking.

Two implementations share the backend routing interface:

- **Deterministic rules:** evaluates enabled text patterns and additional supervisor phrases. The highest matching tier wins; ties retain rule order. Unknown intent uses the configured fallback.
- **LLM classifier + supervisor guardrails:** a backend model proposes a tier, rationale, exact quoted evidence and a human-review flag. The backend validates the output and retains deterministic rules as minimum tier floors. The classifier can promote a ticket but cannot lower those floors. Invalid output or a provider failure stops execution rather than silently changing implementations.

Human-handoff conditions take precedence and skip provider execution. Emergency signals receive protected escalation handling; upgrading a model is not emergency care. A classifier review flag is recorded for oversight, but does not itself connect the customer to a person.

OmniRouter is the custom routing implementation. OpenRouter supplies access to provider models for live calls.

## Workspaces and controls

### Simulation workspace

Choose a request count, fixed baseline tier and workload seed, then run the simulation. With OmniRouter off, all tickets use the selected baseline model. With it on, deterministic routing assigns tiers or human handoff. Reusing the seed reproduces the workload so the strategies can be compared on the same cases.

Processing plays out over approximately 33 seconds for 1,000 tickets. The dashboard shows estimated costs, tokens, tier distribution and illustrative quality assumptions. Filter tickets by current assigned tier or router-selected tier, then open **View audit** to inspect matched evidence, policy snapshots and intervention history.

The audit dialog lets you select any two distinct tiers for authored response illustrations, from very basic TL0 information through relevant TL1 facts, nuanced TL2 explanations and comprehensive TL3 review and commentary on completeness, grounding and escalation. These are simulated examples, not model-generated answers. Simple cases can show little benefit from a higher tier. The simulation workspace has no real-model execution controls or backend handoffs. Its response comparisons and technician interventions remain entirely simulated.

### Live Support

Submit a fictional query through a configured backend to obtain a real provider response. The audit records routing rationale, model identity, policy context, usage, cost when supplied by the provider, and execution timing. LLM routing also records classifier evidence, cost and timing.

Technicians can reassign a case with a reason. The live backend blocks operational reassignment below the required minimum. Controlled comparisons can test a different tier without changing the routing recommendation; they preserve the original provider request with only the answering model changed. Reviewer notes capture omissions or potential follow-up needs without treating customer dissatisfaction as a measured fact.

The browser-only batch simulator does not run LLM classification. Select deterministic routing for batches; use Live Support for the LLM implementation.

### Routing configuration

The supervisor can select the routing implementation, inspect built-in rules and protected tier floors, enable eligible rules, add literal phrases, and raise minimum tiers. Additional controls set urgency phrases and promotion tiers, unknown-intent fallback, and human-handoff conditions.

The **Tier models** tab uses one model family (OpenAI, Anthropic, Google or Grok) for all four tiers. Each tier has a dropdown of that family's synchronous text chat models from a bundled [OpenRouter catalog](https://openrouter.ai/api/v1/models) snapshot. Suggested TL labels use model-variant heuristics (nano/flash-lite/gemma: TL0; mini/haiku/flash/lite: TL1; pro/opus/reasoning/multi-agent: TL3; other variants: TL2), not verified capability rankings. Admins can select any listed model for any tier, including reusing a model. Backend defaults remain available, and previously saved IDs missing from the catalog remain selectable.

**Save simulation preferences** at the bottom of the tab persists just the model settings in browser policy history, without requiring a manual change reason. Other policy drafts are saved through the existing apply controls. Publish policy with supervisor credentials to activate live model selections. Saved mixed-family policies from older versions use the first tier's family in this view; saving normalizes all tiers to the selected family. The classifier still uses `ROUTER_MODEL`; simulator estimates remain illustrative.

The decision-flow view explains the pipeline. The policy sandbox previews deterministic draft changes; it does not fabricate LLM classifications. Applying a local policy affects future simulations, while publishing with separate supervisor credentials changes live backend routing. Existing ticket decisions retain their original snapshots.

Model preference saves record an automatic reason; other policy changes require an entered reason. Local history records the self-declared actor, timestamp and before/after state in browser storage. Backend history uses the configured supervisor principal and records proposed, applied and failed changes. These are demo audit records, not tamper-resistant evidence or individual staff authentication.

Human support is represented by a queue status. No real agent or external service desk is contacted.

## Architecture and methodology

The frontend provides a deterministic batch simulation, Live Support, supervisor policy controls, and audit inspection. Shared routing rules establish minimum task tiers and handoff conditions. The live backend dispatches either the deterministic router or an LLM classifier with those same protected floors, then executes the answering model selected for the final tier through OpenRouter. Handoff conditions skip classifier and answering calls. An LLM classification failure stops execution; a review flag alone does not connect a person.

One selected model family supplies the four model dropdowns. Application tiers describe task categories, while dropdown TL suggestions use model-variant heuristics. Neither validates capability or establishes pricing. Reusing a model across tiers is allowed; distinct tiers need not imply distinct models. Published model IDs override `MODEL_TL0` through `MODEL_TL3`; blank assignments use those backend settings. `ROUTER_MODEL` independently configures the optional classifier.

Local model saves record an automatic reason and persist browser policy history. Applying other local policy edits requires an explicit reason. Publication uses separate supervisor credentials and persists a versioned backend policy. Decisions retain policy snapshots; live execution audits additionally record the effective model mapping, model identity, routing evidence, execution events, usage, costs when supplied, and timing.

### Cost interpretation

**Live prices depend on the selected family and specific model, not the TL label.** For a planning estimate, calculate `input_tokens * input_rate + output_tokens * output_rate` for each call, converting rates quoted per million tokens before multiplying. Include the optional classifier, retries, reassignments, and model comparisons. Use current rates for the actual configured models and record the pricing date. The bundled model dropdown catalog contains names and IDs, not current billing quotes.

**Simulation dollar amounts currently remain fixed illustrative presets.** Changing family or tier-model preferences does not reprice the dashboard. Synthetic token counts, fixed tier rates, a modeled routing surcharge, and retry executions produce its totals. These amounts demonstrate routing tradeoffs and must not be presented as projected spending for selected OpenAI, Anthropic, Google, or Grok models. Assigned model identities belong to policy snapshots, while the simulator's cost and quality calculations still use generic tier assumptions.

Live Support displays provider-reported answering cost and records classifier cost separately. Audit totals combine available execution and routing cost; unavailable cost data stays unknown and cumulative known cost is marked incomplete when necessary. A handoff incurs no model execution cost, but human labor and resolution time remain outside the calculation. Negative savings can occur when routing overhead and repeat executions outweigh savings on initial answers. The same model assigned to multiple tiers retains its own pricing rather than acquiring a different price at each tier.

### Evaluation method

Compare a fixed-tier baseline and deterministic routing using identical seeds and request counts. Required tiers are authored independently of routing outputs. Input estimates use query length plus a context allowance; output lengths are synthetic. The quality illustration uses 96% at or above the required tier, minus 18 percentage points for each tier below it, with a 10% floor. It is an assumed score, not measured response quality. Two-tier response comparisons use authored illustrations. Playback speed and assumed latency are distinct from live backend timings.

Forty-five percent of the workload repeats fictional adaptations of two public case summaries, with rounding for small batches; sixteen authored templates provide the remainder. This is a demonstration workload rather than a representative customer dataset. Harbor Health's fictional handbook supplies the policy context and does not establish actual coverage.

For model-family comparisons, evaluate a held-out fictional sample against the selected model IDs. Grade factual accuracy, policy grounding, completeness, and appropriate escalation, alongside provider-reported usage and measured timing. Retain model configurations and policy versions. Live controlled comparisons preserve the original answering request except for the model; a different tier assigned to the same model is not a distinct model comparison. Report these measured results separately from simulation estimates.

## Suggested demonstration

1. Run a fixed-model baseline using seed 42.
2. Enable deterministic routing and repeat the same workload.
3. Compare costs and inspect a straightforward ticket alongside a complex case.
4. Open simulated response illustrations and inspect their differences.
5. Preview and apply an urgency or handoff rule, then inspect its version history.
6. Publish LLM routing to the backend and submit a live fictional case to inspect classifier evidence and guardrails.

A negative savings figure means the selected strategy cost more than the baseline. The demonstration should explain that result rather than assume routing is always cheaper.

## Run, build and verify

Open `omnirouter/index.html` directly or serve the folder with a static server. The shipped frontend bundle requires no dependencies. Run these commands from the repository root after source changes:

```sh
node omnirouter/build.mjs
node --test omnirouter/backend/*.test.mjs
node omnirouter/package-site.mjs
```

The package step copies only `index.html`, `style.css` and `bundle.js` into `omnirouter/dist`. The build updates the bundle version in the HTML to avoid stale cached JavaScript and rejects broken encoding and stray question-mark separators before generating artifacts.

## Hosting and live configuration

GitHub Pages hosts the static frontend. The repository-root `.github/workflows/omnirouter-pages.yml` builds, tests, packages and deploys it when configured with GitHub Actions as the Pages source. Deployment has not been performed as part of this implementation. If this folder becomes its own repository, adjust workflow paths and command prefixes.

Live execution requires a separate HTTPS backend running Node 22 or newer. Copy `backend/.env.example` to `backend/.env` locally and configure:

- `OPENROUTER_API_KEY` and answering model IDs, either published through Routing configuration or supplied as `MODEL_TL0` through `MODEL_TL3` backend defaults.
- `DEMO_ACCESS_TOKEN` and `ALLOWED_ORIGINS` for presenter access.
- `SUPERVISOR_ACCESS_TOKEN` and `SUPERVISOR_NAME` for policy publication and attribution.
- `ROUTER_MODEL` when using LLM classification.

Start locally with `npm start` from `omnirouter/backend`. Hosted services use `node server.mjs` with environment secrets. Enter the backend URL and presenter token in Live Support; enter the separate supervisor token when publishing policy. Never commit credentials or include them in the static site. Use distinct answering models for meaningful tier comparisons.

The backend supports two concurrent executions, a 30-second classifier timeout, a 60-second answering timeout and a default limit of 50 provider calls per UTC day. A successful LLM-routed request normally uses two calls. Classification adds cost and latency; missing provider cost data remains marked unavailable. Persistent disk is required for audits, policy history and call reservations. Storage supports a single process, not a multi-replica deployment.

## Evidence and practical limits

- Simulation tokens, fixed tier prices, latency and quality percentages are illustrative assumptions. Selecting a different family or model does not change simulation prices. Playback speed is not model throughput.
- Simulated savings include modeled routing overhead and retries. Human labor and resolution time are excluded. Live costs use provider-reported information where available.
- Forty-five percent of a batch repeats fictional adaptations of only two public NY DFS case summaries, 201809-110342 and 201810-110716. The remaining workload uses 16 authored templates with seeded variations. This is not a representative dataset of customer conversations.
- Adaptations omit original outcomes and clinical details and use Harbor's fictional handbook. No bulk dataset was imported; provenance is included in exports.
- Phrase matching can misread negation or incidental context. LLM classification has not been benchmarked for accuracy. Neither implementation is clinical triage.
- Browser storage and backend JSONL records are mutable. Policy-file replacement and audit history are not one database transaction; an applied-audit-failed event means the policy persisted but audit completion failed.

Automated checks cover frontend initialization, navigation, simulation, simulated audit comparisons, routing, provider adapters and selected governance behaviors. The small authored classification check (`node omnirouter/backend/evaluation.mjs`) currently matches 9 of 10 expected tiers; the unmatched doctor-visit paraphrase conservatively uses the TL2 fallback. This is a smoke check, not a benchmark. Real-browser visual verification and real-provider validation remain outstanding. Before presenting live execution, verify a small fictional sample and retain its exported audit as a clearly labeled recorded fallback.

Production use would require individual identities, stronger authorization, protected policy retrieval, durable audit integrity, service-desk integration and task-specific response evaluations. This project demonstrates an auditable routing architecture and its tradeoffs; it does not claim production readiness or regulatory certification.
