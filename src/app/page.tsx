"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { NarrativeWinnersPayload } from "@/types/narrative-winners";

interface BackfillResult {
  period1: string;
  period2: string;
  tickersRequested: number;
  succeeded: number;
  failed: number;
  succeededTickers: string[];
  failedTickers: string[];
}

interface HoldResult {
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

interface NarrativeHoldSummary {
  year: number;
  endYear: number;
  perWinnerInvested: number;
  winners: HoldResult[];
  totalInvested: number;
  totalValueEnd: number;
  totalGain: number;
  totalGainPct: number | null;
}

interface SimulationRunParams {
  startYearMin: number;
  startYearMax: number;
  endYear: number;
  perWinner: number;
  annualIncreasePct: number | null;
  vehiclesPerYear: number | null;
  withdrawalStartYear: number | null;
  withdrawalPct: number | null;
}

export default function Home() {
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NarrativeWinnersPayload | null>(null);

  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);

  const [pathStartMin, setPathStartMin] = useState("");
  const [pathStartMax, setPathStartMax] = useState("");
  const [pathEnd, setPathEnd] = useState("");
  const [pathInvestment, setPathInvestment] = useState("");
  const [pathAnnualIncreasePct, setPathAnnualIncreasePct] = useState("");
  const [pathVehiclesPerYear, setPathVehiclesPerYear] = useState("");
  const [pathWithdrawalStart, setPathWithdrawalStart] = useState("");
  const [pathWithdrawalPct, setPathWithdrawalPct] = useState("");
  const [pathLoading, setPathLoading] = useState(false);
  const [pathError, setPathError] = useState<string | null>(null);
  const [pathRunParams, setPathRunParams] = useState<SimulationRunParams | null>(null);
  const [saveSimLoading, setSaveSimLoading] = useState(false);
  const [saveSimError, setSaveSimError] = useState<string | null>(null);
  const [saveSimPath, setSaveSimPath] = useState<string | null>(null);
  const [pathResult, setPathResult] = useState<{
    results: NarrativeHoldSummary[];
    totalInvested: number;
    totalValueEnd: number;
    totalWithdrawn?: number;
    totalGain: number;
    totalGainPct: number | null;
    annualGains?: { year: number; gain: number; cumulative: number }[];
    annualWithdrawals?: { year: number; withdrawn: number }[];
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const y = parseInt(year, 10);
    if (!year || Number.isNaN(y)) {
      setError("Enter a valid year");
      return;
    }
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/narrative-winners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: y }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleBackfill() {
    setBackfillError(null);
    setBackfillResult(null);
    setBackfillLoading(true);
    try {
      const res = await fetch("/api/price-data/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Backfill failed");
      setBackfillResult(data);
    } catch (err) {
      setBackfillError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBackfillLoading(false);
    }
  }

  async function handlePathSubmit(e: React.FormEvent) {
    e.preventDefault();
    const startMin = parseInt(pathStartMin, 10);
    const startMax = parseInt(pathStartMax, 10);
    const endY = parseInt(pathEnd, 10);
    const inv = parseFloat(pathInvestment);
    const annualIncreasePct = pathAnnualIncreasePct.trim() ? parseFloat(pathAnnualIncreasePct) : NaN;
    const vehiclesPerYear = pathVehiclesPerYear.trim() ? parseInt(pathVehiclesPerYear, 10) : NaN;
    if (!pathStartMin || Number.isNaN(startMin) || startMin < 1980 || startMin > 2030) {
      setPathError("Enter a valid begin start year (1980–2030)");
      return;
    }
    if (!pathStartMax || Number.isNaN(startMax) || startMax < startMin || startMax > 2030) {
      setPathError("Enter a valid end start year (≥ begin start)");
      return;
    }
    if (!pathEnd || Number.isNaN(endY) || endY < startMax || endY > 2030) {
      setPathError("Enter a valid terminal end year (≥ end start)");
      return;
    }
    if (!pathInvestment || !Number.isFinite(inv) || inv <= 0) {
      setPathError("Enter a positive investment per winner");
      return;
    }
    if (pathAnnualIncreasePct.trim() && (!Number.isFinite(annualIncreasePct) || annualIncreasePct < 0)) {
      setPathError("Annual increase % must be a number >= 0");
      return;
    }
    if (pathVehiclesPerYear.trim() && (!Number.isInteger(vehiclesPerYear) || vehiclesPerYear < 1 || vehiclesPerYear > 4)) {
      setPathError("Vehicles per year must be an integer from 1 to 4");
      return;
    }
    setPathError(null);
    setPathResult(null);
    setPathRunParams(null);
    setSaveSimError(null);
    setSaveSimPath(null);
    setPathLoading(true);
    try {
      const params = new URLSearchParams({
        startYearMin: String(startMin),
        startYearMax: String(startMax),
        endYear: String(endY),
        perWinner: String(inv),
      });
      if (Number.isFinite(annualIncreasePct) && annualIncreasePct >= 0) {
        params.set("annualIncreasePct", String(annualIncreasePct));
      }
      const wStart = pathWithdrawalStart.trim() ? parseInt(pathWithdrawalStart, 10) : NaN;
      const wPct = pathWithdrawalPct.trim() ? parseFloat(pathWithdrawalPct) : NaN;
      if (Number.isInteger(wStart) && wStart >= startMin && wStart <= endY && Number.isFinite(wPct) && wPct > 0 && wPct <= 100) {
        params.set("withdrawalStartYear", String(wStart));
        params.set("withdrawalPct", String(wPct));
      }
      if (Number.isInteger(vehiclesPerYear) && vehiclesPerYear >= 1 && vehiclesPerYear <= 4) {
        params.set("vehiclesPerYear", String(vehiclesPerYear));
      }
      const res = await fetch(`/api/analysis/narrative-hold-range?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Simulation failed");
      setPathResult(data);
      setPathRunParams({
        startYearMin: startMin,
        startYearMax: startMax,
        endYear: endY,
        perWinner: inv,
        annualIncreasePct: Number.isFinite(annualIncreasePct) && annualIncreasePct >= 0 ? annualIncreasePct : null,
        vehiclesPerYear: Number.isInteger(vehiclesPerYear) ? vehiclesPerYear : null,
        withdrawalStartYear: Number.isInteger(wStart) && Number.isFinite(wPct) && wPct > 0 && wPct <= 100 ? wStart : null,
        withdrawalPct: Number.isInteger(wStart) && Number.isFinite(wPct) && wPct > 0 && wPct <= 100 ? wPct : null,
      });
    } catch (err) {
      setPathError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPathLoading(false);
    }
  }

  async function handleSaveSimulation() {
    if (!pathResult || !pathRunParams) {
      setSaveSimError("Run a simulation first");
      return;
    }
    setSaveSimError(null);
    setSaveSimPath(null);
    setSaveSimLoading(true);
    try {
      const res = await fetch("/api/analysis/save-simulation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          params: pathRunParams,
          result: pathResult,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setSaveSimPath(String(data.path ?? ""));
    } catch (err) {
      setSaveSimError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaveSimLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <main className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Narrative Winners
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Get contemporary narrative winners for any year (saved locally as JSON).
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Year</CardTitle>
            <CardDescription>
              Enter a year to analyze. OpenAI will return 3–4 narrative winners (stocks, and optionally one crypto/commodity) as perceived in January of the next year.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Input
                  id="year"
                  type="number"
                  min={1980}
                  max={2030}
                  placeholder="e.g. 2017"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  disabled={loading}
                  className="max-w-[140px]"
                />
              </div>
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
              <Button type="submit" disabled={loading}>
                {loading ? "Generating…" : "Get narrative winners"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Price data</CardTitle>
            <CardDescription>
              Backfill historical daily prices (1980–2025) for all tickers from narrative-winners. Saves to <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">data/price-data/</code>. Can take a minute.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {backfillError && (
              <p className="mb-3 text-sm text-red-600 dark:text-red-400">{backfillError}</p>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={handleBackfill}
              disabled={backfillLoading}
            >
              {backfillLoading ? "Backfilling…" : "Backfill price data"}
            </Button>
            {backfillResult && (
              <div className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                <p>
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">{backfillResult.succeeded}</span> succeeded,{" "}
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">{backfillResult.failed}</span> failed
                  {backfillResult.tickersRequested > 0 && (
                    <> of {backfillResult.tickersRequested} tickers</>
                  )}.
                </p>
                {backfillResult.failedTickers.length > 0 && (
                  <p>
                    Failed: {backfillResult.failedTickers.join(", ")}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Test investment path</CardTitle>
            <CardDescription>
              Buy-and-hold: invest the same amount in each narrative winner for a range of start years; each cohort holds until the terminal end year. E.g. begin start 2000, end start 2005, end 2020 → invest in 2000–2005 winners at their respective years, all held to end of 2020.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePathSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="path-start-min" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    First investment year
                  </Label>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">First year we buy that year’s narrative winners.</p>
                  <Input
                    id="path-start-min"
                    type="number"
                    min={1980}
                    max={2030}
                    placeholder="2000"
                    value={pathStartMin}
                    onChange={(e) => setPathStartMin(e.target.value)}
                    disabled={pathLoading}
                    className="mt-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="path-start-max" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Last investment year
                  </Label>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Last year we add a new cohort of winners.</p>
                  <Input
                    id="path-start-max"
                    type="number"
                    min={1980}
                    max={2030}
                    placeholder="2005"
                    value={pathStartMax}
                    onChange={(e) => setPathStartMax(e.target.value)}
                    disabled={pathLoading}
                    className="mt-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="path-end" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Hold until year
                  </Label>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">All positions valued at end of this year.</p>
                  <Input
                    id="path-end"
                    type="number"
                    min={1980}
                    max={2030}
                    placeholder="2020"
                    value={pathEnd}
                    onChange={(e) => setPathEnd(e.target.value)}
                    disabled={pathLoading}
                    className="mt-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="path-investment" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    $ per winner
                  </Label>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Amount in each narrative winner, per cohort.</p>
                  <Input
                    id="path-investment"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="5000"
                    value={pathInvestment}
                    onChange={(e) => setPathInvestment(e.target.value)}
                    disabled={pathLoading}
                    className="mt-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="path-vehicles-per-year" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Vehicles per year
                  </Label>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Optional. Top-rated winners to include (1-4).</p>
                  <Input
                    id="path-vehicles-per-year"
                    type="number"
                    min={1}
                    max={4}
                    step={1}
                    placeholder="e.g. 2"
                    value={pathVehiclesPerYear}
                    onChange={(e) => setPathVehiclesPerYear(e.target.value)}
                    disabled={pathLoading}
                    className="mt-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="path-annual-increase-pct" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Annual increase %
                  </Label>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Optional. Increase $ per winner each new cohort year.</p>
                  <Input
                    id="path-annual-increase-pct"
                    type="number"
                    min={0}
                    step={0.1}
                    placeholder="e.g. 5"
                    value={pathAnnualIncreasePct}
                    onChange={(e) => setPathAnnualIncreasePct(e.target.value)}
                    disabled={pathLoading}
                    className="mt-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="path-withdrawal-start" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Withdrawals start (year)
                  </Label>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Optional. First year we take % out.</p>
                  <Input
                    id="path-withdrawal-start"
                    type="number"
                    min={1980}
                    max={2030}
                    placeholder="e.g. 2010"
                    value={pathWithdrawalStart}
                    onChange={(e) => setPathWithdrawalStart(e.target.value)}
                    disabled={pathLoading}
                    className="mt-1"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="path-withdrawal-pct" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Withdrawal %
                  </Label>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Optional. % of portfolio at end of each year.</p>
                  <Input
                    id="path-withdrawal-pct"
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    placeholder="e.g. 4"
                    value={pathWithdrawalPct}
                    onChange={(e) => setPathWithdrawalPct(e.target.value)}
                    disabled={pathLoading}
                    className="mt-1"
                  />
                </div>
              </div>
              {pathError && (
                <p className="text-sm text-red-600 dark:text-red-400">{pathError}</p>
              )}
              <Button type="submit" disabled={pathLoading}>
                {pathLoading ? "Calculating…" : "Run simulation"}
              </Button>
            </form>
            {pathResult && (
              <div className="mt-6 space-y-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-zinc-500 dark:text-zinc-400">Total invested</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    ${pathResult.totalInvested.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                  <div className="col-span-2 -mt-1">
                    <Accordion type="single" collapsible>
                      <AccordionItem value="invested-by-year" className="border-zinc-200 dark:border-zinc-800">
                        <AccordionTrigger className="py-1 text-xs font-medium text-zinc-600 hover:no-underline dark:text-zinc-400">
                          Show invested by year
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-zinc-200 bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-900/50">
                                  <th className="px-3 py-2 text-left font-medium text-zinc-900 dark:text-zinc-50">Year</th>
                                  <th className="px-3 py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">Invested</th>
                                  <th className="px-3 py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">Cumulative</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pathResult.results
                                  .slice()
                                  .sort((a, b) => a.year - b.year)
                                  .reduce<{ year: number; invested: number; cumulative: number }[]>(
                                    (acc, summary, i) => {
                                      const cumulative = (acc[i - 1]?.cumulative ?? 0) + summary.totalInvested;
                                      acc.push({ year: summary.year, invested: summary.totalInvested, cumulative });
                                      return acc;
                                    },
                                    []
                                  )
                                  .map((row) => (
                                    <tr key={row.year} className="border-b border-zinc-200 dark:border-zinc-800">
                                      <td className="px-3 py-2 text-zinc-900 dark:text-zinc-50">{row.year}</td>
                                      <td className="px-3 py-2 text-right text-zinc-900 dark:text-zinc-50">
                                        ${row.invested.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">
                                        ${row.cumulative.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                  <span className="text-zinc-500 dark:text-zinc-400">Value at end</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    ${pathResult.totalValueEnd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                  {pathResult.totalWithdrawn != null && pathResult.totalWithdrawn > 0 && (
                    <>
                      <span className="text-zinc-500 dark:text-zinc-400">Total withdrawn</span>
                      <span className="font-medium text-zinc-900 dark:text-zinc-50">
                        ${pathResult.totalWithdrawn.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </span>
                    </>
                  )}
                  <span className="text-zinc-500 dark:text-zinc-400">Total gain</span>
                  <span className={`font-medium ${pathResult.totalGain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    ${pathResult.totalGain.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    {pathResult.totalGainPct != null && (
                      <span className="ml-1 text-zinc-600 dark:text-zinc-400">
                        ({pathResult.totalGainPct >= 0 ? "+" : ""}{pathResult.totalGainPct.toFixed(1)}%)
                      </span>
                    )}
                  </span>
                  <div className="col-span-2 -mt-1">
                    <Accordion type="single" collapsible>
                      <AccordionItem value="gain-by-year" className="border-zinc-200 dark:border-zinc-800">
                        <AccordionTrigger className="py-1 text-xs font-medium text-zinc-600 hover:no-underline dark:text-zinc-400">
                          Show gain by year (calendar)
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-zinc-200 bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-900/50">
                                  <th className="px-3 py-2 text-left font-medium text-zinc-900 dark:text-zinc-50">Year</th>
                                  <th className="px-3 py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">Gain</th>
                                  <th className="px-3 py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">Cumulative</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(pathResult.annualGains ?? []).map((row) => (
                                    <tr key={row.year} className="border-b border-zinc-200 dark:border-zinc-800">
                                      <td className="px-3 py-2 text-zinc-900 dark:text-zinc-50">{row.year}</td>
                                      <td className={`px-3 py-2 text-right ${row.gain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                        ${row.gain.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className={`px-3 py-2 text-right ${row.cumulative >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                        ${row.cumulative.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </div>
                </div>
                <div className="space-y-2">
                  <Button type="button" variant="secondary" onClick={handleSaveSimulation} disabled={saveSimLoading}>
                    {saveSimLoading ? "Saving…" : "Save Simulation"}
                  </Button>
                  {saveSimError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{saveSimError}</p>
                  )}
                  {saveSimPath && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      Saved to <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">{saveSimPath}</code>
                    </p>
                  )}
                </div>
                {pathResult.annualWithdrawals != null && pathResult.annualWithdrawals.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">Revenue / realized (withdrawals by year)</p>
                    <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-zinc-200 bg-zinc-100/50 dark:border-zinc-800 dark:bg-zinc-900/50">
                            <th className="px-3 py-2 text-left font-medium text-zinc-900 dark:text-zinc-50">Year</th>
                            <th className="px-3 py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">Withdrawn</th>
                            <th className="px-3 py-2 text-right font-medium text-zinc-900 dark:text-zinc-50">Cumulative</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pathResult.annualWithdrawals.reduce<{ year: number; withdrawn: number; cumulative: number }[]>(
                            (acc, row, i) => {
                              const cumulative = (acc[i - 1]?.cumulative ?? 0) + row.withdrawn;
                              acc.push({ ...row, cumulative });
                              return acc;
                            },
                            []
                          ).map((row) => (
                            <tr key={row.year} className="border-b border-zinc-200 dark:border-zinc-800">
                              <td className="px-3 py-2 text-zinc-900 dark:text-zinc-50">{row.year}</td>
                              <td className="px-3 py-2 text-right text-zinc-900 dark:text-zinc-50">
                                ${row.withdrawn.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">
                                ${row.cumulative.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div>
                  <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">By start year</p>
                  <ul className="space-y-3">
                    {pathResult.results.map((summary) => (
                      <li
                        key={summary.year}
                        className="rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50"
                      >
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="font-medium text-zinc-900 dark:text-zinc-50">
                            {summary.year} → {summary.endYear}
                          </span>
                          <span className={summary.totalGain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                            ${summary.totalGain.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                            {summary.totalGainPct != null && (
                              <> ({summary.totalGainPct >= 0 ? "+" : ""}{summary.totalGainPct.toFixed(1)}%)</>
                            )}
                          </span>
                        </div>
                        <ul className="space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                          {summary.winners.map((w) => (
                            <li key={w.ticker} className="flex justify-between gap-2">
                              <span>{w.name} ({w.ticker})</span>
                              {w.gainPct != null && (
                                <span className={w.gain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                                  {w.gain >= 0 ? "+" : ""}{w.gainPct.toFixed(1)}%
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle>{result.year} narrative winners</CardTitle>
              <CardDescription>
                Saved to <code className="rounded bg-zinc-200 px-1 dark:bg-zinc-800">data/narrative-winners/{result.year}.json</code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {result.winners.map((w, i) => (
                  <li
                    key={`${w.ticker}-${i}`}
                    className="rounded-lg border border-zinc-200 bg-zinc-50/50 py-2 px-3 dark:border-zinc-800 dark:bg-zinc-900/50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="font-medium text-zinc-900 dark:text-zinc-50">{w.name}</span>
                        <span className="ml-2 text-sm text-zinc-500 dark:text-zinc-400">
                          {w.ticker}
                        </span>
                      </div>
                      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300">
                        {w.type}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Score {Math.round(w.score)} • Weight {(w.weight * 100).toFixed(1)}%
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
