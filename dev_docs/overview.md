# Analysis Platform — Overview

This app is a **platform for financial and investing data collection and analysis**. It is not a single product but a base for building multiple tools that:

- **Collect** financial/market data (from APIs, LLMs, scrapers, etc.)
- **Store** results in a structured way under `data/`
- **Expose** workflows via the Next.js UI and API routes

## Architecture

- **Framework:** Next.js (App Router)
- **UI:** React with shadcn/ui–style components
- **API:** Route handlers under `src/app/api/` for each tool or data pipeline
- **Data:** File-based storage under `data/`, organized by tool or domain (e.g. `data/narrative-winners/`)
- **Types:** Shared TypeScript types in `src/types/` for payloads and domain models

## Conventions

- **One tool, one (or few) API routes:** Each “tool” (e.g. narrative winners) typically has its own route under `src/app/api/<tool-name>/`.
- **Data under `data/`:** Each tool writes to a subfolder such as `data/<tool-name>/`. Format is usually JSON; structure is documented in the tool-specific doc.
- **Env:** Secrets (e.g. `OPENAI_API_KEY`) live in `.env.local`; the platform does not commit keys.
- **Docs:** High-level platform docs live in `dev_docs/`. Each major tool has its own doc describing flow, schema, and usage:
  - [overview.md](overview.md) — this file
  - [narrative-winners.md](narrative-winners.md) — narrative winners (LLM, storage)
  - [price-data.md](price-data.md) — historical prices, backfill, lookup
  - [investment-path.md](investment-path.md) — test investment path (cohorts, hold, withdrawals, revenue table)

## Current tools

| Tool              | API route                             | Data path                    | Purpose                                                                 |
|-------------------|----------------------------------------|------------------------------|-------------------------------------------------------------------------|
| Narrative Winners | `POST /api/narrative-winners`          | `data/narrative-winners/`    | Yearly “narrative winner” assets (LLM-based)                            |
| Price data        | `POST /api/price-data/backfill`       | `data/price-data/`           | Historical daily prices for narrative-winners tickers                  |
| Investment path   | `GET /api/analysis/narrative-hold-range` | —                         | Simulate cohorts (range of start years), hold to terminal year, optional withdrawals. See [investment-path.md](investment-path.md). |
| Narrative hold    | `GET /api/analysis/narrative-hold`     | —                            | Single-cohort variant (one start year, hold to end year)                |

## Adding a new tool

1. **Types:** Add or reuse types in `src/types/` for the tool’s inputs/outputs and stored data.
2. **API:** Add a route under `src/app/api/<tool>/route.ts` that performs the pipeline (fetch, transform, validate) and writes under `data/<tool>/`.
3. **UI (optional):** Add a page or section that calls the new API and displays or links to the stored data.
4. **Docs:** Add `dev_docs/<tool>.md` describing the flow, schema, and any env or config.

This keeps the codebase consistent as you add more financial data collection and analysis tools.
