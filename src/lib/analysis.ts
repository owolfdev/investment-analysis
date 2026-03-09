import { getWinnersByYear } from "@/lib/narrative-winners";
import {
  getCommonCoverageEndYear,
  getPricePointOnOrAfter,
  getYearEndPricePoint,
} from "@/lib/price-data";

export interface HoldResult {
  ticker: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  priceStart: number | null;
  priceEnd: number | null;
  invested: number;
  shares: number;
  valueEnd: number;
  gain: number;
  gainPct: number | null;
}

/** Per-year withdrawal total for one cohort (when withdrawal is used). */
export interface WithdrawalYear {
  year: number;
  withdrawn: number;
}

/** End-of-year portfolio value for one cohort (after any withdrawal that year). */
export interface AnnualValueYear {
  year: number;
  valueEnd: number;
}

export interface NarrativeHoldSummary {
  year: number;
  endYear: number;
  perWinnerInvested: number;
  winners: HoldResult[];
  totalInvested: number;
  totalValueEnd: number;
  totalGain: number;
  totalGainPct: number | null;
  /** Present when withdrawalPct > 0: total withdrawn over the period. */
  totalWithdrawn?: number;
  /** Present when withdrawalPct > 0: withdrawn amount by calendar year (start withdrawal → end year). */
  withdrawalsByYear?: WithdrawalYear[];
  /** Present when includeAnnual is true: end-of-year value by calendar year for this cohort. */
  annualValueByYear?: AnnualValueYear[];
}

/**
 * Simulate: invest $perWinner in each narrative winner for investment year `year`, hold until end of `endYear`.
 * Optionally withdraw withdrawalPct% of portfolio value at end of each year from withdrawalStartYear through endYear.
 * Uses first available price on or after Jan 1 of `year` as buy; end-of-year prices for each year when simulating withdrawals.
 */
export async function narrativeHoldToEnd(
  year: number,
  endYear: number,
  perWinner: number,
  options?: { withdrawalStartYear?: number; withdrawalPct?: number; vehiclesPerYear?: number; includeAnnual?: boolean }
): Promise<NarrativeHoldSummary> {
  const withdrawalStartYear = options?.withdrawalStartYear ?? null;
  const withdrawalPct = options?.withdrawalPct ?? 0;
  const vehiclesPerYear = options?.vehiclesPerYear;
  const includeAnnual = options?.includeAnnual === true;
  const useWithdrawal = withdrawalStartYear != null && withdrawalPct > 0 && withdrawalPct <= 100;

  const winnersAll = await getWinnersByYear(year);
  if (winnersAll.length === 0) {
    throw new Error(`No narrative winners found for ${year}`);
  }
  const winnersSorted = [...winnersAll].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const winners = Number.isInteger(vehiclesPerYear) && (vehiclesPerYear ?? 0) > 0
    ? winnersSorted.slice(0, Math.min(vehiclesPerYear!, winnersSorted.length))
    : winnersSorted;
  if (winners.length === 0) {
    throw new Error(`No winners selected for ${year}. Increase vehiclesPerYear or check data.`);
  }

  const coverageEndYear = await getCommonCoverageEndYear(winners.map((w) => w.ticker));
  if (coverageEndYear == null) {
    throw new Error(`Missing price data for at least one ticker in ${year} narrative winners`);
  }
  if (endYear > coverageEndYear) {
    throw new Error(
      `endYear ${endYear} exceeds common price-data coverage (${coverageEndYear}) for cohort ${year}`
    );
  }

  const startDate = `${year}-01-01`;
  const endDate = `${endYear}-12-31`;

  const results: HoldResult[] = [];
  let totalInvested = 0;
  let totalValueEnd = 0;
  let totalWithdrawn = 0;
  const withdrawalsByYearMap: Record<number, number> = {};
  const annualValueByYearMap: Record<number, number> = {};

  for (const w of winners) {
    const startPoint = await getPricePointOnOrAfter(w.ticker, startDate);
    if (!startPoint) {
      throw new Error(`No start-of-year price found for ${w.ticker} in cohort ${year}`);
    }
    if (!startPoint.date.startsWith(`${year}-`)) {
      throw new Error(
        `Ticker ${w.ticker} has no tradable price within ${year} (first available ${startPoint.date})`
      );
    }

    const priceStart = startPoint.close;
    const invested = perWinner;
    let shares = priceStart && priceStart > 0 ? invested / priceStart : 0;

    if (!useWithdrawal) {
      if (includeAnnual) {
        for (let y = year; y <= endYear; y++) {
          const yearEndPoint = await getYearEndPricePoint(w.ticker, y);
          if (!yearEndPoint) {
            throw new Error(`No year-end price found for ${w.ticker} in ${y}`);
          }
          const valueEndOfYear = shares > 0 ? shares * yearEndPoint.close : 0;
          annualValueByYearMap[y] = (annualValueByYearMap[y] ?? 0) + valueEndOfYear;
        }
      }
      const endPoint = await getYearEndPricePoint(w.ticker, endYear);
      if (!endPoint) {
        throw new Error(`No year-end price found for ${w.ticker} in ${endYear}`);
      }
      const priceEnd = endPoint.close;
      const valueEnd = priceEnd != null && shares > 0 ? shares * priceEnd : 0;
      const gain = valueEnd - invested;
      const gainPct = invested > 0 && priceStart != null && priceStart > 0
        ? (gain / invested) * 100
        : null;
      totalInvested += invested;
      totalValueEnd += valueEnd;
      results.push({
        ticker: w.ticker,
        name: w.name,
        type: w.type,
        startDate,
        endDate,
        priceStart: priceStart ?? null,
        priceEnd: priceEnd ?? null,
        invested,
        shares,
        valueEnd,
        gain,
        gainPct,
      });
      continue;
    }

    // Year-by-year with withdrawals
    for (let y = year; y <= endYear; y++) {
      const yearEndPoint = await getYearEndPricePoint(w.ticker, y);
      if (yearEndPoint == null) {
        throw new Error(`No in-year price found for ${w.ticker} in ${y}`);
      }
      const priceEndOfYear = yearEndPoint.close;
      const value = shares * priceEndOfYear;
      if (y >= withdrawalStartYear! && value > 0) {
        const withdrawn = value * (withdrawalPct / 100);
        totalWithdrawn += withdrawn;
        withdrawalsByYearMap[y] = (withdrawalsByYearMap[y] ?? 0) + withdrawn;
        shares *= 1 - withdrawalPct / 100;
      }
      if (includeAnnual) {
        const valueAfterWithdrawal = shares > 0 ? shares * priceEndOfYear : 0;
        annualValueByYearMap[y] = (annualValueByYearMap[y] ?? 0) + valueAfterWithdrawal;
      }
    }
    const endPoint = await getYearEndPricePoint(w.ticker, endYear);
    if (!endPoint) {
      throw new Error(`No year-end price found for ${w.ticker} in ${endYear}`);
    }
    const priceEnd = endPoint.close;
    const valueEnd = priceEnd != null && shares > 0 ? shares * priceEnd : 0;
    const gainPct = invested > 0 && priceStart != null && priceStart > 0
      ? ((valueEnd - invested) / invested) * 100
      : null;

    totalInvested += invested;
    totalValueEnd += valueEnd;

    results.push({
      ticker: w.ticker,
      name: w.name,
      type: w.type,
      startDate,
      endDate,
      priceStart: priceStart ?? null,
      priceEnd: priceEnd ?? null,
      invested,
      shares,
      valueEnd,
      gain: valueEnd - invested,
      gainPct,
    });
  }

  const withdrawalsByYear: WithdrawalYear[] = useWithdrawal
    ? Object.entries(withdrawalsByYearMap)
        .map(([y, withdrawn]) => ({ year: Number(y), withdrawn }))
        .sort((a, b) => a.year - b.year)
    : [];
  const annualValueByYear: AnnualValueYear[] = includeAnnual
    ? Object.entries(annualValueByYearMap)
        .map(([y, valueEnd]) => ({ year: Number(y), valueEnd }))
        .sort((a, b) => a.year - b.year)
    : [];

  const totalGain = totalValueEnd + (useWithdrawal ? totalWithdrawn : 0) - totalInvested;
  const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : null;

  return {
    year,
    endYear,
    perWinnerInvested: perWinner,
    winners: results,
    totalInvested,
    totalValueEnd,
    totalGain,
    totalGainPct,
    ...(useWithdrawal && {
      totalWithdrawn: withdrawalsByYear.reduce((s, x) => s + x.withdrawn, 0),
      withdrawalsByYear,
    }),
    ...(includeAnnual && { annualValueByYear }),
  };
}
