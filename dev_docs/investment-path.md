# Investment Path — Test simulation

The **investment path** (UI: “Test investment path”) simulates a buy-and-hold strategy across multiple **cohorts** of narrative winners, with optional **withdrawals** from a chosen year until the terminal year. The UI takes a **monthly** amount per winner, then annualizes it by multiplying by 12 before running the yearly simulation. It answers: “If we invest $X per month in each narrative winner for years 2000–2005 and hold until 2020 (and optionally take y% out each year from 2010), what do we get?”

## Inputs (and what they do)

| Input | Meaning |
|-------|--------|
| **First investment year** | First year we buy: we invest in that year’s narrative winners at the start of this year. (Begin start.) |
| **Last investment year** | Last year we add a new cohort: we invest in that year’s narrative winners at the start of this year. (End start.) |
| **Hold until year** | Terminal year: all positions are valued (and optionally withdrawn from) at the **end** of this year. |
| **$ per winner** | Dollar amount entered **per month** for **each** narrative winner. The UI annualizes it to `monthly × 12` before simulation. Total invested = (number of investment years) × (winners per year) × (`monthly × 12`). |
| **Withdrawals start (year)** | Optional. First calendar year when we begin taking the withdrawal % out. Withdrawals happen at **end** of each year from this year through **Hold until year**. |
| **Withdrawal %** | Optional. At the end of each year from “Withdrawals start” through “Hold until year”, we take this percentage of the **current portfolio value** (sell that much). The rest stays invested. |

**Validation:** First investment year ≤ Last investment year ≤ Hold until year. If withdrawal is used, Withdrawals start must be in [First investment year, Hold until year] and Withdrawal % in (0, 100].

## Flow (step by step)

1. **UI** (`src/app/page.tsx`)  
   User fills the inputs and runs the simulation. Frontend converts the monthly per-winner input to an annual amount with `monthly × 12`, then calls `GET /api/analysis/narrative-hold-range`.

2. **API** (`src/app/api/analysis/narrative-hold-range/route.ts`)  
  - Parses `startYearMin`, `startYearMax`, `endYear`, `perWinner`, and optionally `withdrawalStartYear`, `withdrawalPct`. `perWinner` received here is already annualized by the UI.  
  - For each investment year `y` from `startYearMin` to `startYearMax`, calls `narrativeHoldToEnd(y, endYear, perWinner, options)`.  
   - Aggregates: total invested, total value at end, total withdrawn (if any). When withdrawals are used, aggregates per-year withdrawals across all cohorts into `annualWithdrawals`.  
   - Returns `results` (one summary per cohort), `totalInvested`, `totalValueEnd`, `totalWithdrawn` (if withdrawal), `totalGain`, `totalGainPct`, and `annualWithdrawals` (if withdrawal).

3. **Analysis** (`src/lib/analysis.ts`)  
   - **Without withdrawal:** For one cohort (one start year), loads that year’s narrative winners, gets start-of-year and end-of-terminal-year price per ticker, computes shares and value at end.  
   - **With withdrawal:** For each ticker, runs year-by-year from cohort year to terminal year; at end of each year, if year ≥ withdrawalStartYear, withdraws `withdrawalPct%` of that ticker’s value (reduces shares proportionally). Records per-year withdrawal amounts. Final value at end is the remaining shares × terminal-year end price.  
   - Returns per-winner breakdown and, when withdrawal is used, `totalWithdrawn` and `withdrawalsByYear`.

4. **Price lookup**  
   Uses `getPriceOnOrAfter(ticker, "YYYY-01-01")` for buy price and `getPriceOnDate(ticker, "YYYY-12-31")` for end-of-year prices. Data comes from `data/price-data/{ticker}.json` (see [price-data.md](./price-data.md)).

## API

### Request

`GET /api/analysis/narrative-hold-range`

| Query param | Required | Description |
|-------------|----------|-------------|
| `startYearMin` | Yes | First investment year (e.g. 2000). |
| `startYearMax` | Yes | Last investment year (e.g. 2005). |
| `endYear` | Yes | Hold until end of this year (e.g. 2020). |
| `perWinner` | Yes | Dollars per narrative winner for each investment year (e.g. 5000). |
| `withdrawalStartYear` | No | First year we take withdrawals (e.g. 2010). |
| `withdrawalPct` | No | Percentage of portfolio withdrawn at end of each year from withdrawal start through endYear (e.g. 4). |

### Response

```ts
{
  results: NarrativeHoldSummary[];  // one per cohort year
  totalInvested: number;
  totalValueEnd: number;
  totalWithdrawn?: number;          // present when withdrawal params used
  totalGain: number;
  totalGainPct: number | null;
  annualWithdrawals?: { year: number; withdrawn: number }[];  // present when withdrawal used
}
```

- **Total gain** = `totalValueEnd + (totalWithdrawn ?? 0) - totalInvested`.  
- **annualWithdrawals** = one row per calendar year from withdrawal start through end year; `withdrawn` is the total amount taken out that year across all cohorts and tickers. Used in the UI as the “Revenue / realized (withdrawals by year)” table (with a cumulative column).

## UI result

- **Summary:** Total invested, Value at end, Total withdrawn (if any), Total gain (and %).  
- **Revenue table:** When withdrawals are used, a table: **Year** | **Withdrawn** | **Cumulative** (from first withdrawal year through terminal year).  
- **By start year:** Each cohort’s start year → end year, total gain for that cohort, and per-winner gain %.
- **Save simulation:** UI includes a save action that writes the current run to `data/simulations/<generated-name>.md` with inputs, summary, annual withdrawals (if any), and by-year breakdown.

## Code locations

| Piece | Location |
|-------|----------|
| Types, simulation | `src/lib/analysis.ts` (`NarrativeHoldSummary`, `HoldResult`, `WithdrawalYear`, `narrativeHoldToEnd`) |
| Range API | `src/app/api/analysis/narrative-hold-range/route.ts` |
| Single-year API | `src/app/api/analysis/narrative-hold/route.ts` (same logic, one cohort) |
| UI | `src/app/page.tsx` (“Test investment path” card) |

## Dependencies

- **Narrative winners:** `data/narrative-winners/{year}.json` must exist for each cohort year (see [narrative-winners.md](./narrative-winners.md)).  
- **Price data:** `data/price-data/{ticker}.json` must exist for all tickers in those narrative-winners files (see [price-data.md](./price-data.md)); run the price-data backfill first.
