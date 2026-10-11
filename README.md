# OmniRouter

OmniRouter is a concept demo of explainable AI model routing. It uses fictional health-insurance support requests to show how task complexity, routing policies, model assignments, and human handoff can be inspected and configured.

**[Explore the live concept demo](https://sudeep39.github.io/omnirouter/)**

## What you can explore

- **Simulation workspace:** run reproducible synthetic workloads, compare routing with a fixed-tier baseline, and inspect decision audits and simulated responses.
- **Routing configuration:** configure protected routing rules, urgency, fallback, handoff, and four model-tier assignments using OpenAI, Anthropic, Google, or Grok.
- **Live Support:** preview real model execution through a separately configured backend, with execution audits and controlled comparisons.
- **Architecture and methodology:** understand the pipeline, data sources, assumptions, and practical limits.

The primary experience is simulation. Displayed simulation costs and quality are illustrative; selecting different models does not reprice those estimates. GitHub Pages hosts the static frontend. Live model calls require a separately hosted backend and incur provider charges.

## Documentation and deliverables

- [Full project README and setup instructions](omnirouter/README.md)
- [Project build and workflow report](omnirouter/PROJECT_REPORT.md)
- [Word report for Google Docs](omnirouter/OmniRouter_Project_Report.docx)
- [Application source](omnirouter/)
- [GitHub Pages deployment workflow](.github/workflows/omnirouter-pages.yml)

## Run and verify

Open `omnirouter/index.html` or serve the folder with a static web server. From the repository root, use Node.js 22 or newer to rebuild, test, and package the frontend:

```sh
node omnirouter/build.mjs
node --test omnirouter/backend/*.test.mjs
node omnirouter/package-site.mjs
```

The fictional workload combines authored scenarios and adaptations of two public case summaries. It is a demonstration dataset, not a representative collection of customer conversations. See the full README for provenance and evaluation limits.
