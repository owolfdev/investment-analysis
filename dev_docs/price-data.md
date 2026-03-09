# Price Data — Flow & Schema

Price data provides **historical daily OHLCV** for every ticker that appears in any narrative-winners file. It is used to reference prices against narrative winners—e.g. “invest $50 in each narrative winner for investment year 2000 and hold until 2025; what is the total gain?”

## Purpose

- **Ticker set:** Derived from all `data/narrative-winners/*.json` files (unique tickers across all years).
- **Date range:** One range for the whole platform (default **1980-01-01** to **2025-12-31**) so any narrative-winners year can be analyzed.
- **Lookup:** For a given ticker and date, we can get the closing price (or nearest trading day) to compute returns.

## Flow

1. **Ticker set**  
   `src/lib/narrative-winners.ts` exposes `getTickerList()` (and `getTickerSet()`, `getYearRange()`), which read all `data/narrative-winners/*.json` and return the unique tickers.

2. **Backfill**  
   Call `POST /api/price-data/backfill` (optionally with `period1` / `period2` in the body). The route:
   - Gets the ticker list from narrative-winners.
   - For each ticker, fetches daily history from **Yahoo Finance** (`yahoo-finance2`) for the given range.
   - Saves one file per ticker: `data/price-data/{TICKER}.json`.
   - Waits ~400 ms between tickers to reduce rate-limit risk.
   - Returns counts of succeeded/failed tickers and lists.

3. **Lookup**  
   - **`getPriceOnDate(ticker, date)`** — closing price on the **nearest trading day on or before** `date` (e.g. “price at end of 2025”).
   - **`getPriceOnOrAfter(ticker, date)`** — closing price on the **first trading day on or after** `date` (e.g. “price at start of 2000”).
   - Used by `src/lib/analysis.ts` for the “narrative hold” simulation.

4. **Analysis**  
   Used by the investment-path simulation (see [investment-path.md](investment-path.md)):
   - **Single cohort:** `GET /api/analysis/narrative-hold?year=2000&endYear=2025&perWinner=50` — one start year, hold to end year.
   - **Range + optional withdrawals:** `GET /api/analysis/narrative-hold-range?startYearMin=2000&startYearMax=2005&endYear=2020&perWinner=5000&withdrawalStartYear=2010&withdrawalPct=4` — multiple cohorts, optional annual withdrawal % from a chosen year through terminal year.
   - For each cohort/year: loads that year’s narrative winners, gets start-of-year and end-of-year prices (and every end-of-year when simulating withdrawals), computes shares, value at end, and optionally per-year withdrawals. Price lookups use `getPriceOnOrAfter` (buy) and `getPriceOnDate` (end-of-year).

## Schema

### Stored file (per ticker)

**Path:** `data/price-data/{TICKER}.json` (e.g. `AAPL.json`, `CSCO.json`)

```ts
interface TickerPriceData {
  ticker: string;
  periodStart: string;   // YYYY-MM-DD (actual first date in data)
  periodEnd: string;     // YYYY-MM-DD (actual last date in data)
  history: PriceBar[];   // sorted ascending by date
  fetchedAt: string;     // ISO timestamp
}

interface PriceBar {
  date: string;   // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose?: number;
  volume: number;
}
```

### Backfill API

- **Request:** `POST /api/price-data/backfill`  
  Body (optional): `{ "period1": "1980-01-01", "period2": "2025-12-31" }`
- **Response:**  
  `{ period1, period2, tickersRequested, succeeded, failed, succeededTickers, failedTickers }`

### Narrative-hold APIs

- **Single cohort:** `GET /api/analysis/narrative-hold?year=2000&endYear=2025&perWinner=50`  
  Response: `NarrativeHoldSummary` in `src/lib/analysis.ts` (year, endYear, perWinnerInvested, winners[], totals).
- **Range + withdrawals:** `GET /api/analysis/narrative-hold-range?...`  
  Full request/response and flow are documented in [investment-path.md](investment-path.md). Response includes `results[]`, `totalInvested`, `totalValueEnd`, `totalWithdrawn` (if withdrawal), `totalGain`, `totalGainPct`, and `annualWithdrawals[]` (revenue table by year).

## Code locations

| Piece           | Location |
|-----------------|----------|
| Types           | `src/types/price-data.ts` |
| Narrative index | `src/lib/narrative-winners.ts` (ticker set, winners by year, year range) |
| Fetch & lookup  | `src/lib/price-data.ts` |
| Backfill route  | `src/app/api/price-data/backfill/route.ts` |
| Hold analysis   | `src/lib/analysis.ts`, `src/app/api/analysis/narrative-hold/route.ts`, `src/app/api/analysis/narrative-hold-range/route.ts`. Full flow: [investment-path.md](investment-path.md) |
| Stored data     | `data/price-data/{TICKER}.json` |

## Data source

- **Yahoo Finance** via the `yahoo-finance2` npm package. No API key required. Stocks are well supported; some commodities or crypto tickers (e.g. XAU for gold) may not resolve or may need a different symbol (e.g. GC=F). Failed tickers are reported in the backfill response.

## Referencing narrative winners

- Narrative winners are defined in `data/narrative-winners/{year}.json`.
- Price data is keyed by **ticker** only; the same ticker can appear in multiple years. To answer “narrative winners of 2000, hold to 2025”, we use the **tickers** from the 2000 file and look up their prices in `data/price-data/{ticker}.json` for the dates Jan 1, 2000 and Dec 31, 2025 (or nearest trading days).
