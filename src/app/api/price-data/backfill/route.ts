import { NextResponse } from "next/server";
import { getTickerList } from "@/lib/narrative-winners";
import { fetchHistorical, saveTickerData } from "@/lib/price-data";

/** Default range covering all narrative-winners years (configurable via body). */
const DEFAULT_PERIOD1 = "1980-01-01";
const DEFAULT_PERIOD2 = "2025-12-31";

/** Delay between tickers to avoid rate limits (ms). */
const DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      period1?: string;
      period2?: string;
    };
    const period1 = body?.period1 ?? DEFAULT_PERIOD1;
    const period2 = body?.period2 ?? DEFAULT_PERIOD2;

    const tickers = await getTickerList();
    if (tickers.length === 0) {
      return NextResponse.json(
        { error: "No tickers found. Add narrative-winners data first." },
        { status: 400 }
      );
    }

    const succeeded: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      const data = await fetchHistorical(ticker, period1, period2);
      if (data && data.history.length > 0) {
        await saveTickerData(data);
        succeeded.push(ticker);
      } else {
        failed.push(ticker);
      }
      if (i < tickers.length - 1) await sleep(DELAY_MS);
    }

    return NextResponse.json({
      period1,
      period2,
      tickersRequested: tickers.length,
      succeeded: succeeded.length,
      failed: failed.length,
      succeededTickers: succeeded,
      failedTickers: failed,
    });
  } catch (err) {
    console.error("price-data backfill error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
