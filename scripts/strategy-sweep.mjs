import { readFile, readdir, writeFile, mkdir } from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const NARRATIVE_DIR = path.join(ROOT, "data", "narrative-winners");
const PRICE_DIR = path.join(ROOT, "data", "price-data");
const REPORT_DIR = path.join(ROOT, "dev_docs", "reports");

const WINDOW_YEARS = Number(process.env.WINDOW_YEARS ?? 15);
const STEP_YEARS = Number(process.env.STEP_YEARS ?? 5);
const WINDOW_START_MIN = Number(process.env.WINDOW_START_MIN ?? 1980);
const WINDOW_START_MAX = Number(process.env.WINDOW_START_MAX ?? 2010);
const END_YEAR_CAP = Number(process.env.END_YEAR_CAP ?? 2025);
const PER_WINNER = Number(process.env.PER_WINNER ?? 10000);
const ANNUAL_BUDGET = Number(process.env.ANNUAL_BUDGET ?? 40000);

const VEHICLE_OPTIONS = [1, 2, 3, 4];
const DEPLOYMENT_OPTIONS = ["continuous", "front5"];
const CONTRIBUTION_OPTIONS = ["per_winner", "annual_budget"];

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const weight = idx - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

function median(arr) {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  return percentile(s, 0.5);
}

function makeDate(year, md) {
  return `${year}-${md}`;
}

function getFirstTradeInYearOrNull(history, year) {
  const start = makeDate(year, "01-01");
  const end = makeDate(year, "12-31");
  for (const bar of history) {
    if (bar.date < start) continue;
    if (bar.date > end) return null;
    return bar;
  }
  return null;
}

function getYearEndInYearOrNull(history, year) {
  const start = makeDate(year, "01-01");
  const end = makeDate(year, "12-31");
  let best = null;
  for (const bar of history) {
    if (bar.date < start) continue;
    if (bar.date > end) break;
    best = bar;
  }
  return best;
}

async function loadNarrativeByYear() {
  const files = (await readdir(NARRATIVE_DIR))
    .filter((f) => /^\d{4}\.json$/.test(f))
    .sort();
  const map = new Map();
  for (const file of files) {
    const raw = await readFile(path.join(NARRATIVE_DIR, file), "utf8");
    const data = JSON.parse(raw);
    const winners = Array.isArray(data.winners) ? data.winners : [];
    winners.sort((a, b) => (Number(b.score ?? 0) - Number(a.score ?? 0)));
    map.set(Number(data.year), winners);
  }
  return map;
}

async function loadPriceByTicker() {
  const files = (await readdir(PRICE_DIR)).filter((f) => f.endsWith(".json"));
  const map = new Map();
  for (const file of files) {
    const raw = await readFile(path.join(PRICE_DIR, file), "utf8");
    const data = JSON.parse(raw);
    map.set(String(data.ticker).toUpperCase(), data.history ?? []);
  }
  return map;
}

function makeWindows() {
  const windows = [];
  for (let start = WINDOW_START_MIN; start <= WINDOW_START_MAX; start += STEP_YEARS) {
    const end = start + WINDOW_YEARS - 1;
    if (end > END_YEAR_CAP) continue;
    windows.push({ start, end });
  }
  return windows;
}

function scoreWindow({
  narrativeByYear,
  priceByTicker,
  windowStart,
  windowEnd,
  vehiclesPerYear,
  deployment,
  contributionMode,
}) {
  const cohortEnd = deployment === "front5" ? Math.min(windowStart + 4, windowEnd) : windowEnd;
  const legs = [];
  const annualContrib = [];

  for (let year = windowStart; year <= cohortEnd; year++) {
    const winners = narrativeByYear.get(year) ?? [];
    const selected = winners.slice(0, Math.min(vehiclesPerYear, winners.length));
    if (selected.length === 0) {
      return { error: `No winners for ${year}` };
    }

    const perWinnerInvested = contributionMode === "annual_budget"
      ? ANNUAL_BUDGET / selected.length
      : PER_WINNER;

    annualContrib.push({ year, amount: perWinnerInvested * selected.length });

    for (const winner of selected) {
      const ticker = String(winner.ticker).toUpperCase();
      const history = priceByTicker.get(ticker);
      if (!history || history.length === 0) {
        return { error: `Missing price history: ${ticker}` };
      }
      const startBar = getFirstTradeInYearOrNull(history, year);
      if (!startBar) {
        return { error: `No in-year start price for ${ticker} in ${year}` };
      }
      const endBar = getYearEndInYearOrNull(history, windowEnd);
      if (!endBar) {
        return { error: `No window-end price for ${ticker} in ${windowEnd}` };
      }
      const shares = perWinnerInvested / startBar.close;
      const endValue = shares * endBar.close;
      legs.push({
        ticker,
        cohortYear: year,
        invested: perWinnerInvested,
        shares,
        startPrice: startBar.close,
        endPrice: endBar.close,
        endValue,
        gain: endValue - perWinnerInvested,
      });
    }
  }

  const totalInvested = legs.reduce((s, x) => s + x.invested, 0);
  const totalValueEnd = legs.reduce((s, x) => s + x.endValue, 0);
  const totalGain = totalValueEnd - totalInvested;
  const moic = totalInvested > 0 ? totalValueEnd / totalInvested : null;
  const cagrEquivalent = moic != null ? Math.pow(moic, 1 / WINDOW_YEARS) - 1 : null;

  const contributionByYear = new Map(annualContrib.map((x) => [x.year, x.amount]));
  const curve = [];
  let peak = -Infinity;
  let maxDrawdown = 0;

  for (let year = windowStart; year <= windowEnd; year++) {
    let value = 0;
    for (const leg of legs) {
      if (leg.cohortYear > year) continue;
      const history = priceByTicker.get(leg.ticker);
      const yEnd = getYearEndInYearOrNull(history, year);
      if (!yEnd) continue;
      value += leg.shares * yEnd.close;
    }
    const contributed = contributionByYear.get(year) ?? 0;
    curve.push({ year, value, contributed });
    peak = Math.max(peak, value);
    if (peak > 0) {
      const dd = (peak - value) / peak;
      maxDrawdown = Math.max(maxDrawdown, dd);
    }
  }

  const topContributors = [...legs]
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 5)
    .map((x) => ({ ticker: x.ticker, cohortYear: x.cohortYear, gain: x.gain }));

  return {
    windowStart,
    windowEnd,
    vehiclesPerYear,
    deployment,
    contributionMode,
    cohorts: cohortEnd - windowStart + 1,
    totalInvested,
    totalValueEnd,
    totalGain,
    gainPct: totalInvested > 0 ? (totalGain / totalInvested) * 100 : null,
    moic,
    cagrEquivalent,
    maxDrawdownPct: maxDrawdown * 100,
    topContributors,
    curve,
  };
}

function aggregateScenario(results) {
  const valid = results.filter((r) => !r.error);
  const errors = results.filter((r) => r.error);
  const moics = valid.map((r) => r.moic).filter((x) => x != null);
  const cagrs = valid.map((r) => r.cagrEquivalent).filter((x) => x != null);
  const gains = valid.map((r) => r.gainPct).filter((x) => x != null);
  const drawdowns = valid.map((r) => r.maxDrawdownPct);

  return {
    windowsTested: results.length,
    windowsValid: valid.length,
    windowsFailed: errors.length,
    failedMessages: [...new Set(errors.map((e) => e.error))],
    medianMoic: median(moics),
    medianCagrPct: median(cagrs) != null ? median(cagrs) * 100 : null,
    medianGainPct: median(gains),
    worstGainPct: gains.length ? Math.min(...gains) : null,
    bestGainPct: gains.length ? Math.max(...gains) : null,
    winRatePct: gains.length ? (gains.filter((g) => g > 0).length / gains.length) * 100 : null,
    medianMaxDrawdownPct: median(drawdowns),
    medianInvested: median(valid.map((r) => r.totalInvested)),
    medianValueEnd: median(valid.map((r) => r.totalValueEnd)),
  };
}

async function main() {
  const [narrativeByYear, priceByTicker] = await Promise.all([
    loadNarrativeByYear(),
    loadPriceByTicker(),
  ]);

  const windows = makeWindows();
  const scenarios = [];

  for (const vehiclesPerYear of VEHICLE_OPTIONS) {
    for (const deployment of DEPLOYMENT_OPTIONS) {
      for (const contributionMode of CONTRIBUTION_OPTIONS) {
        const windowResults = [];
        for (const w of windows) {
          const r = scoreWindow({
            narrativeByYear,
            priceByTicker,
            windowStart: w.start,
            windowEnd: w.end,
            vehiclesPerYear,
            deployment,
            contributionMode,
          });
          windowResults.push(r);
        }
        const aggregate = aggregateScenario(windowResults);
        scenarios.push({
          id: `v${vehiclesPerYear}-${deployment}-${contributionMode}`,
          vehiclesPerYear,
          deployment,
          contributionMode,
          ...aggregate,
          windows: windowResults,
        });
      }
    }
  }

  const ranked = [...scenarios]
    .filter((s) => s.windowsValid > 0)
    .sort((a, b) => {
      const aScore = (a.medianCagrPct ?? -Infinity) - 0.2 * (a.medianMaxDrawdownPct ?? 0);
      const bScore = (b.medianCagrPct ?? -Infinity) - 0.2 * (b.medianMaxDrawdownPct ?? 0);
      return bScore - aScore;
    })
    .map((s, idx) => ({ rank: idx + 1, ...s }));

  const payload = {
    generatedAt: new Date().toISOString(),
    config: {
      windowYears: WINDOW_YEARS,
      stepYears: STEP_YEARS,
      windowStartMin: WINDOW_START_MIN,
      windowStartMax: WINDOW_START_MAX,
      endYearCap: END_YEAR_CAP,
      perWinner: PER_WINNER,
      annualBudget: ANNUAL_BUDGET,
      vehicleOptions: VEHICLE_OPTIONS,
      deploymentOptions: DEPLOYMENT_OPTIONS,
      contributionOptions: CONTRIBUTION_OPTIONS,
      windows,
    },
    rankedScenarios: ranked,
  };

  await mkdir(REPORT_DIR, { recursive: true });
  const outPath = path.join(REPORT_DIR, "strategy-sweep.json");
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(`Scenarios: ${ranked.length}, windows each: ${windows.length}`);
  if (ranked[0]) {
    console.log(`Top scenario: ${ranked[0].id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
