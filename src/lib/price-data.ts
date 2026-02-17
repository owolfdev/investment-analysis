import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import type { PriceBar, TickerPriceData } from "@/types/price-data";

const PRICE_DATA_DIR = path.join(process.cwd(), "data", "price-data");

/**
 * Narrative-winners ticker → Yahoo Finance symbol when they differ.
 * Data is still stored under the narrative ticker (e.g. data/price-data/XAU.json).
 */
const TICKER_TO_YAHOO_SYMBOL: Record<string, string> = {
  "BRK.A": "BRK-A",   // Berkshire Hathaway Class A (Yahoo uses hyphen)
  "FB": "META",       // Facebook historical series now lives under META
  "BTC": "BTC-USD",   // Avoid collision with non-crypto symbols
  "GC": "GC=F",       // Gold futures
  "XAU": "GC=F",      // Gold (use same futures series as GC)
};

export interface PricePoint {
  date: string;
  close: number;
}

function barToRecord(row: { date: Date; open: number; high: number; low: number; close: number; volume?: number; adjClose?: number }): PriceBar {
  const dateStr = typeof row.date === "string" ? row.date.slice(0, 10) : new Date(row.date).toISOString().slice(0, 10);
  return {
    date: dateStr,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    adjClose: row.adjClose != null ? Number(row.adjClose) : undefined,
    volume: Number(row.volume ?? 0),
  };
}

/**
 * Path to stored price file for a ticker.
 */
export function getPriceDataPath(ticker: string): string {
  const safe = ticker.toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  return path.join(PRICE_DATA_DIR, `${safe}.json`);
}

/**
 * Load stored price data for a ticker. Returns null if file missing or invalid.
 */
export async function loadTickerData(ticker: string): Promise<TickerPriceData | null> {
  const filePath = getPriceDataPath(ticker);
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw) as TickerPriceData;
    if (data?.ticker && Array.isArray(data?.history)) return data;
  } catch {
    // file missing or invalid
  }
  return null;
}

/**
 * Get the closing price for a ticker on a given date (YYYY-MM-DD).
 * Uses the nearest trading day on or before the requested date so "start of year" works.
 * Returns null if no data or date is before any available bar.
 */
export async function getPriceOnDate(ticker: string, date: string): Promise<number | null> {
  const data = await loadTickerData(ticker);
  if (!data || data.history.length === 0) return null;
  // history is sorted ascending; find last bar on or before date
  let best: PriceBar | null = null;
  for (const bar of data.history) {
    if (bar.date > date) break;
    best = bar;
  }
  return best ? best.close : null;
}

/**
 * Get price/date pair on or before date.
 */
export async function getPricePointOnDate(ticker: string, date: string): Promise<PricePoint | null> {
  const data = await loadTickerData(ticker);
  if (!data || data.history.length === 0) return null;
  let best: PriceBar | null = null;
  for (const bar of data.history) {
    if (bar.date > date) break;
    best = bar;
  }
  return best ? { date: best.date, close: best.close } : null;
}

/**
 * Get the first available closing price on or after a given date (e.g. first trading day of year).
 * Returns null if no data on or after that date.
 */
export async function getPriceOnOrAfter(ticker: string, date: string): Promise<number | null> {
  const data = await loadTickerData(ticker);
  if (!data || data.history.length === 0) return null;
  for (const bar of data.history) {
    if (bar.date >= date) return bar.close;
  }
  return null;
}

/**
 * Get first price/date pair on or after date.
 */
export async function getPricePointOnOrAfter(ticker: string, date: string): Promise<PricePoint | null> {
  const data = await loadTickerData(ticker);
  if (!data || data.history.length === 0) return null;
  for (const bar of data.history) {
    if (bar.date >= date) return { date: bar.date, close: bar.close };
  }
  return null;
}

/**
 * Get the last available price in a calendar year. Returns null if no bar exists in that year.
 */
export async function getYearEndPricePoint(ticker: string, year: number): Promise<PricePoint | null> {
  const data = await loadTickerData(ticker);
  if (!data || data.history.length === 0) return null;
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  let best: PriceBar | null = null;
  for (const bar of data.history) {
    if (bar.date < start) continue;
    if (bar.date > end) break;
    best = bar;
  }
  return best ? { date: best.date, close: best.close } : null;
}

/**
 * Smallest period-end year across tickers (the latest year that all symbols can support).
 */
export async function getCommonCoverageEndYear(tickers: string[]): Promise<number | null> {
  if (tickers.length === 0) return null;
  let minYear: number | null = null;
  for (const ticker of tickers) {
    const data = await loadTickerData(ticker);
    if (!data || !data.periodEnd) return null;
    const year = Number(data.periodEnd.slice(0, 4));
    if (!Number.isInteger(year)) return null;
    minYear = minYear == null ? year : Math.min(minYear, year);
  }
  return minYear;
}

/**
 * Persist price data for a ticker to data/price-data/{ticker}.json.
 */
export async function saveTickerData(payload: TickerPriceData): Promise<void> {
  await mkdir(PRICE_DATA_DIR, { recursive: true });
  const filePath = getPriceDataPath(payload.ticker);
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

/**
 * Fetch historical daily data from Yahoo Finance and return in our TickerPriceData shape.
 * Does not persist; use saveTickerData after.
 * period1/period2 as YYYY-MM-DD strings.
 */
export async function fetchHistorical(
  ticker: string,
  period1: string,
  period2: string
): Promise<TickerPriceData | null> {
  const normalized = ticker.toUpperCase().trim();
  const yahooSymbol = TICKER_TO_YAHOO_SYMBOL[normalized] ?? normalized;
  const YahooFinance = (await import("yahoo-finance2")).default;
  const yahooFinance = new YahooFinance();
  try {
    const rows = await yahooFinance.historical(yahooSymbol, {
      period1,
      period2,
      interval: "1d",
    });
    if (!rows || rows.length === 0) return null;
    const history = rows.map(barToRecord).sort((a, b) => a.date.localeCompare(b.date));
    const first = history[0];
    const last = history[history.length - 1];
    return {
      ticker: ticker.toUpperCase(),
      periodStart: first.date,
      periodEnd: last.date,
      history,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
