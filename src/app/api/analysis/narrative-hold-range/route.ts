import { NextResponse } from "next/server";
import { narrativeHoldToEnd } from "@/lib/analysis";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startYearMin = Number(searchParams.get("startYearMin"));
    const startYearMax = Number(searchParams.get("startYearMax"));
    const endYear = Number(searchParams.get("endYear") ?? searchParams.get("end_year"));
    const perWinner = Number(searchParams.get("perWinner") ?? searchParams.get("per_winner") ?? 50);
    const annualIncreasePctParam = searchParams.get("annualIncreasePct") ?? searchParams.get("annual_increase_pct");
    const annualIncreasePct = annualIncreasePctParam != null && annualIncreasePctParam !== ""
      ? Number(annualIncreasePctParam)
      : 0;
    const vehiclesPerYearParam = searchParams.get("vehiclesPerYear") ?? searchParams.get("vehicles_per_year");
    const vehiclesPerYear = vehiclesPerYearParam != null && vehiclesPerYearParam !== ""
      ? Number(vehiclesPerYearParam)
      : null;
    const withdrawalStartYearParam = searchParams.get("withdrawalStartYear");
    const withdrawalPctParam = searchParams.get("withdrawalPct");
    const withdrawalStartYear = withdrawalStartYearParam !== null && withdrawalStartYearParam !== ""
      ? Number(withdrawalStartYearParam)
      : null;
    const withdrawalPct = withdrawalPctParam !== null && withdrawalPctParam !== ""
      ? Number(withdrawalPctParam)
      : 0;
    const useWithdrawal = withdrawalStartYear != null
      && Number.isInteger(withdrawalStartYear)
      && withdrawalStartYear >= 1980
      && withdrawalStartYear <= 2030
      && Number.isFinite(withdrawalPct)
      && withdrawalPct > 0
      && withdrawalPct <= 100
      && withdrawalStartYear <= endYear;

    if (!Number.isInteger(startYearMin) || startYearMin < 1980 || startYearMin > 2030) {
      return NextResponse.json({ error: "Invalid startYearMin" }, { status: 400 });
    }
    if (!Number.isInteger(startYearMax) || startYearMax < startYearMin || startYearMax > 2030) {
      return NextResponse.json({ error: "Invalid startYearMax" }, { status: 400 });
    }
    if (!Number.isInteger(endYear) || endYear < startYearMax || endYear > 2030) {
      return NextResponse.json({ error: "Invalid endYear (must be ≥ startYearMax)" }, { status: 400 });
    }
    if (!Number.isFinite(perWinner) || perWinner <= 0) {
      return NextResponse.json({ error: "Invalid perWinner" }, { status: 400 });
    }
    if (!Number.isFinite(annualIncreasePct) || annualIncreasePct < 0) {
      return NextResponse.json({ error: "Invalid annualIncreasePct (must be >= 0)" }, { status: 400 });
    }
    if (vehiclesPerYear != null && (!Number.isInteger(vehiclesPerYear) || vehiclesPerYear < 1 || vehiclesPerYear > 4)) {
      return NextResponse.json({ error: "Invalid vehiclesPerYear (must be integer 1-4)" }, { status: 400 });
    }

    const options = {
      includeAnnual: true,
      ...(useWithdrawal ? { withdrawalStartYear: withdrawalStartYear!, withdrawalPct } : {}),
      ...(vehiclesPerYear != null ? { vehiclesPerYear } : {}),
    };

    const results = [];
    let totalInvested = 0;
    let totalValueEnd = 0;
    let totalWithdrawn = 0;
    const withdrawalsByYearAgg: Record<number, number> = {};
    const valueEndByYearAgg: Record<number, number> = {};
    const investedByYearAgg: Record<number, number> = {};

    for (let year = startYearMin; year <= startYearMax; year++) {
      const cohortOffset = year - startYearMin;
      const perWinnerForYear = perWinner * Math.pow(1 + annualIncreasePct / 100, cohortOffset);
      const summary = await narrativeHoldToEnd(year, endYear, perWinnerForYear, options);
      results.push(summary);
      totalInvested += summary.totalInvested;
      totalValueEnd += summary.totalValueEnd;
      investedByYearAgg[year] = (investedByYearAgg[year] ?? 0) + summary.totalInvested;
      if (summary.totalWithdrawn != null) {
        totalWithdrawn += summary.totalWithdrawn;
        for (const row of summary.withdrawalsByYear ?? []) {
          withdrawalsByYearAgg[row.year] = (withdrawalsByYearAgg[row.year] ?? 0) + row.withdrawn;
        }
      }
      for (const row of summary.annualValueByYear ?? []) {
        valueEndByYearAgg[row.year] = (valueEndByYearAgg[row.year] ?? 0) + row.valueEnd;
      }
    }

    const totalGain = totalValueEnd + totalWithdrawn - totalInvested;
    const totalGainPct = totalInvested > 0 ? (totalGain / totalInvested) * 100 : null;

    const annualWithdrawals = useWithdrawal
      ? Object.entries(withdrawalsByYearAgg)
          .map(([year, withdrawn]) => ({ year: Number(year), withdrawn }))
          .sort((a, b) => a.year - b.year)
      : [];
    let prevWealth = 0;
    let cumulativeGain = 0;
    let cumulativeWithdrawn = 0;
    const annualGains: { year: number; gain: number; cumulative: number }[] = [];
    for (let y = startYearMin; y <= endYear; y++) {
      cumulativeWithdrawn += withdrawalsByYearAgg[y] ?? 0;
      const wealthEnd = (valueEndByYearAgg[y] ?? 0) + cumulativeWithdrawn;
      const investedInYear = investedByYearAgg[y] ?? 0;
      const gain = wealthEnd - prevWealth - investedInYear;
      cumulativeGain += gain;
      annualGains.push({ year: y, gain, cumulative: cumulativeGain });
      prevWealth = wealthEnd;
    }

    return NextResponse.json({
      results,
      totalInvested,
      totalValueEnd,
      totalWithdrawn: useWithdrawal ? totalWithdrawn : undefined,
      totalGain,
      totalGainPct,
      annualIncreasePct: annualIncreasePct > 0 ? annualIncreasePct : undefined,
      annualGains,
      annualWithdrawals: annualWithdrawals.length > 0 ? annualWithdrawals : undefined,
    });
  } catch (err) {
    console.error("narrative-hold-range API error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error ? 400 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
