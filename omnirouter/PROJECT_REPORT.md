# OmniRouter Project Build and Workflow Report

OmniRouter is a concept application that makes AI model routing visible and configurable. It demonstrates how support requests can be assigned to different model tiers based on task complexity, while retaining the evidence, policy settings, and intervention history behind each decision. The primary experience is a reproducible simulation; a separate Live Support workflow provides backend integration for real model calls when configured.

## Project overview

We built OmniRouter around a fictional health insurer, Harbor Health. Requests range from locating a plan brochure to comparing benefits, interpreting referral rules, and reviewing a denied claim. These tasks illustrate why an application might use different levels of model capability instead of sending every request to the same model.

The project has four main areas:

- **Simulation workspace:** generates seeded fictional workloads, compares a fixed-tier baseline with routing, and displays illustrative costs, assumed quality, token estimates, and routing distribution. Users can inspect individual decisions and compare authored response illustrations.
- **Routing configuration:** lets an administrator configure routing rules, urgency promotion, fallback behavior, human-handoff conditions, and model assignments. One family—OpenAI, Anthropic, Google, or Grok—is selected across four tier dropdowns.
- **Live Support:** sends fictional queries to a configured Node.js backend for real model execution through OpenRouter. It supports execution audits, reassignment, controlled model comparisons, and reviewer notes.
- **Architecture and methodology:** explains the routing pipeline, data provenance, cost interpretation, assumptions, and limits of the concept.

The four application tiers are TL0 for document navigation, TL1 for benefits and comparisons, TL2 for interacting provisions, and TL3 for case-specific coverage and appeals. These are task categories, not provider-certified capability rankings.

The main outcome is an inspectable routing concept. Cost savings, better responses, and reduced support workload are potential benefits to evaluate, rather than results established by the demo.

## Datasets and sources used

The workload combines authored synthetic scenarios with fictional adaptations of public case summaries. It does not use a bulk import of customer conversations.

| Source | How it was used | Important distinction |
| --- | --- | --- |
| Sixteen authored scenario templates | Generate fictional questions about documents, benefits, referrals, networks, exclusions, and appeals, with seeded variations | Synthetic demonstration data rather than real customer records |
| Two New York Department of Financial Services public appeal summaries | Inspire fictional case-specific questions; source case IDs are 201809-110342 and 201810-110716 | Original outcomes, diagnoses, demographics, and clinical specifics are omitted |
| HHS Health Insurance Marketplace dataset on Kaggle | Provides a domain reference for insurance-plan data categories | No dataset rows were imported |
| CMS Marketplace public-use files | Provide a primary domain reference | Not a source of customer conversations or real Harbor Health policy |
| Harbor Health Demo Handbook | Supplies fictional policy excerpts for documents, benefits, referrals, networks, and appeals | Authored fixtures, not actual insurance coverage terms |
| OpenRouter model catalog | Supplies a bundled snapshot of model names and IDs for the family-specific dropdowns | Configuration metadata, not training data, a capability benchmark, or a current billing quote |

Approximately 45% of a generated batch consists of repeated adaptations of the two public cases; the remainder comes from authored scenarios. The mix is rounded for small batches. A batch of 1,000 tickets therefore does not represent 1,000 independent real cases. Reusing a seed reproduces the workload for comparison.

Source references: [NY DFS public appeal search](https://www.dfs.ny.gov/public-appeal/search), [Kaggle HHS Health Insurance Marketplace](https://www.kaggle.com/datasets/hhs/health-insurance-marketplace), [CMS public-use files](https://www.cms.gov/marketplace/resources/data/public-use-files), and [OpenRouter model catalog](https://openrouter.ai/api/v1/models).

## Prompts used during vibe coding

Development used an iterative conversation with the coding assistant: describe the desired behavior, implement it, review the interface, refine the request, and verify the result. The examples below capture the development prompts and their purpose. Longer requests are summarized rather than presented as verbatim quotations.

| Development prompt | Purpose and resulting change |
| --- | --- |
| Add a tab to configure the model for each tier and include OpenAI, Anthropic, Google, and Grok | Introduced the Tier models tab and persisted tier assignments |
| Use one model family across all tiers; replace text boxes with model dropdowns showing tier suggestions; add a save button | Replaced independent family inputs with a shared family selector, model catalog dropdowns, and local preference saving |
| Rewrite architecture and methodology to reflect the updates and account for costs depending on the chosen models | Updated the explanatory view and README; clarified that live prices depend on specific models while simulation prices remain illustrative |
| Suggest ways to distinguish simulation, live support, and configuration while emphasizing the concept | Led to grouped navigation, a concept banner, workspace labels, clearer simulation result wording, and separation of local saves from backend publication |
| “Apply the changes.” | Turned the interface recommendations into implemented changes |
| Remove stray question marks and review the application and documentation before committing | Corrected broken separators, added encoding checks, reviewed wording, and fixed stale human-handoff displays |
| Remove time-based presentation wording and describe the project as a concept | Made the presentation reusable without a dated rollout label |
| “Rename supervisor controls to something more appropriate.” | Renamed the section Routing configuration across the interface and documentation |

These prompts show how the requirements became more specific through review: the focus moved from adding controls to making their meaning, scope, and effects clear.

## Prompts used by the live application

Development prompts are separate from the system prompts used for live execution. The backend implements two roles:

**Classifier prompt:** classify a fictional insurance-support query and return JSON containing a tier from 0 to 3, a brief rationale, exact quoted evidence, and a human-review flag. It defines the task categories and instructs the model to treat user text as data and not answer the query. The backend validates the response and preserves deterministic minimum-tier rules.

**Answering prompt:** act as support for a fictional insurance demo, use only the supplied policy excerpts, cite their IDs, acknowledge insufficient evidence, and avoid real coverage determinations or medical advice. It also specifies emergency escalation handling and requires human review for case-specific coverage.

The simulation does not execute these prompts. Its response comparisons use authored illustrations.

## Iterations tried

**Model configuration evolved from flexible inputs to guided selection.** The first implementation offered a family selector and model-ID text box for every tier. Review showed that the intended experience was one family across all tiers. The next iteration introduced a shared selector and dropdowns listing that family's models, with suggested tier labels. Administrators can reuse a model across tiers, and saved IDs remain visible if they disappear from the catalog.

**Saving was separated from live activation.** Model preferences gained a local save action with an automatic history reason. Other policy edits retain explicit attribution and reason requirements. Publishing to the backend remains a separate action with supervisor credentials. This distinction prevents a local configuration save from appearing to activate real model calls.

**Cost explanations became more precise.** The architecture initially displayed a fixed dollar schedule by tier. It was revised to explain that actual prices depend on the selected model and usage. The dashboard still uses fixed illustrative presets, so changing model preferences does not reprice the simulation. Captions now make that limitation explicit.

**The presentation became simulation-led.** Navigation and workspace notices distinguish the concept experience from the backend preview. Simulation costs, quality, and response comparisons are labeled as illustrative or assumed. Time-based rollout language was removed, and Supervisor Controls became Routing configuration.

**Repeated encoding issues led to a build safeguard.** Some new separators and mathematical symbols appeared as question marks. They were replaced with reliable entities or plain notation, and the build now checks for encoding damage and stray separators. Generated browser and distribution artifacts were rebuilt after corrections.

**Review also addressed state consistency.** Simulated escalation now clears the previous model assignment when a case moves to human support. Live handoff clears stale model-comparison content so the displayed results match the current case.

## Learnings and workflow observations

**A convincing simulation needs explicit boundaries.** Realistic dashboards and response comparisons can be mistaken for measured results. Labels at the point of use—illustrative cost, assumed quality, and simulated response comparison—are more useful than relying on a disclaimer elsewhere.

**Model families, task tiers, capability, and price are different concepts.** Selecting a family narrows the model catalog. Assigning a model to a tier expresses an administrative choice. Suggested tier labels are heuristics, and neither labels nor family membership establish measured suitability. The same model assigned to several tiers keeps its own pricing.

**Small interface refinements can change the meaning of a feature.** A shared selector simplified the intended configuration. Renaming the section broadened its meaning beyond a supervisor role. Separating save and publish actions clarified which environment a change affects.

**Iteration works best with concrete behavior.** Requests became more effective when they specified the exact interaction: one selector for all tiers, dropdowns instead of text boxes, a save button at the bottom, or a clear boundary between simulation and live execution. Those instructions could be implemented and verified directly.

**Provenance matters as much as workload size.** Repeated variations of two cases do not create a large independent evaluation set. The synthetic mix supports a demonstration of routing behavior, but it does not establish performance on representative customer traffic.

**Automated checks and visual review serve different purposes.** Tests verified navigation, simulation, persistence, routing, provider adapters, and governance behavior. Encoding scans and syntax checks caught additional problems. Browser rendering and real-provider validation are still separate checks needed before treating the concept as a validated operational system.

## Validation and remaining work

The latest implementation checks passed all 18 automated tests. The project review also verified syntax for 20 JavaScript files and scanned source, documentation, and generated artifacts for encoding problems. A small authored classification check matched 9 of 10 expected tiers; the unmatched doctor-visit paraphrase used the conservative TL2 fallback. That result is a smoke check, not a benchmark.

Simulation quality is assumed: 96% at or above the authored required tier, minus 18 percentage points for each tier below it, with a 10% floor. Costs use synthetic tokens and fixed tier presets. Live execution instead records provider-reported usage and available costs, including separate classifier overhead; unknown costs remain marked unavailable. Human labor and resolution time are excluded.

Further development should validate the actual model assignments on held-out fictional cases, incorporate appropriate current pricing into planning estimates, and expand backend integration. Production use would also require individual identities, stronger authorization, durable audit integrity, and real service-desk integration. The delivered project demonstrates the architecture and workflow; it does not claim production readiness or verified savings.

## Project references

The implementation and methodology are documented in the project README and the Architecture and methodology view in the application. Key source files are `omnirouter/README.md`, `omnirouter/index.html`, `routing.mjs`, `supervisor.js`, `workload.mjs`, `case-scenarios.mjs`, `model-catalog.mjs`, and the backend routing and execution modules.
