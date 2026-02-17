/** Single day's OHLCV (and adjusted close) from historical data. */
export interface PriceBar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose?: number;
  volume: number;
}

/** Stored file format: one file per ticker under data/price-data/{ticker}.json */
export interface TickerPriceData {
  ticker: string;
  /** Date range actually present (may be subset of requested range). */
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  /** Sorted by date ascending (oldest first). */
  history: PriceBar[];
  /** When this file was last fetched. */
  fetchedAt: string;   // ISO
}
