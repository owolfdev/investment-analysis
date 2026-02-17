import { NextResponse } from "next/server";
import { access, mkdir, writeFile } from "fs/promises";
import path from "path";

interface HoldResult {
  ticker: string;
  name: string;
  type: string;
  invested: number;
  valueEnd: number;
  gain: number;
  gainPct: number | null;
}

interface NarrativeHoldSummary {
  year: number;
  endYear: number;
  winners: HoldResult[];
  totalInvested: number;
  totalValueEnd: number;
  totalGain: number;
  totalGainPct: number | null;
}

interface SavePayload {
  params: {
    startYearMin: number;
    startYearMax: number;
    endYear: number;
    perWinner: number;
    annualIncreasePct?: number | null;
    vehiclesPerYear?: number | null;
    withdrawalStartYear?: number | null;
    withdrawalPct?: number | null;
  };
  result: {
    results: NarrativeHoldSummary[];
    totalInvested: number;
    totalValueEnd: number;
    totalWithdrawn?: number;
    totalGain: number;
    totalGainPct: number | null;
    annualWithdrawals?: { year: number; withdrawn: number }[];
  };
}

const OUTPUT_DIR = path.join(process.cwd(), "data", "simulations");

function formatMoney(value: number): string {
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function numberToken(value: number): string {
  const safe = String(value);
  return safe.includes(".") ? safe.replace(/\./g, "p") : safe;
}

function buildBaseFileName(payload: SavePayload): string {
  const p = payload.params;
  const annualIncreasePart = p.annualIncreasePct != null && p.annualIncreasePct > 0
    ? `inc%${numberToken(p.annualIncreasePct)}`
    : "inc0";
  const vehicles = p.vehiclesPerYear ?? "all";
  const withdrawalPart = p.withdrawalStartYear != null && p.withdrawalPct != null
    ? `${p.withdrawalStartYear}_%${numberToken(p.withdrawalPct)}`
    : "none";
  return `${p.startYearMin}_${p.startYearMax}-${p.endYear}_$${numberToken(p.perWinner)}_${annualIncreasePart}_${vehicles}_${withdrawalPart}`;
}

async function uniqueFilePath(baseName: string): Promise<{ fileName: string; absolutePath: string }> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  let index = 0;
  while (true) {
    const suffix = index === 0 ? "" : `_${index}`;
    const fileName = `${baseName}${suffix}.md`;
    const absolutePath = path.join(OUTPUT_DIR, fileName);
    try {
      await access(absolutePath);
      index += 1;
    } catch {
      return { fileName, absolutePath };
    }
  }
}

function buildMarkdown(payload: SavePayload, savedFileName: string): string {
  const { params, result } = payload;
  const lines: string[] = [];
  lines.push(`# Simulation Result: ${savedFileName}`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Inputs");
  lines.push(`- First investment year: ${params.startYearMin}`);
  lines.push(`- Last investment year: ${params.startYearMax}`);
  lines.push(`- Hold until year: ${params.endYear}`);
  lines.push(`- $ per winner: ${params.perWinner}`);
  lines.push(`- Annual increase (%): ${params.annualIncreasePct != null ? params.annualIncreasePct : 0}`);
  lines.push(`- Vehicles per year: ${params.vehiclesPerYear ?? "all"}`);
  if (params.withdrawalStartYear != null && params.withdrawalPct != null) {
    lines.push(`- Withdrawals: start ${params.withdrawalStartYear}, ${params.withdrawalPct}%`);
  } else {
    lines.push("- Withdrawals: none");
  }
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Total invested: $${formatMoney(result.totalInvested)}`);
  lines.push(`- Value at end: $${formatMoney(result.totalValueEnd)}`);
  if (result.totalWithdrawn != null) lines.push(`- Total withdrawn: $${formatMoney(result.totalWithdrawn)}`);
  lines.push(`- Total gain: $${formatMoney(result.totalGain)} (${formatPct(result.totalGainPct)})`);
  lines.push("");

  if (result.annualWithdrawals && result.annualWithdrawals.length > 0) {
    lines.push("## Revenue / Realized (Withdrawals by Year)");
    lines.push("");
    lines.push("| Year | Withdrawn | Cumulative |");
    lines.push("|---|---:|---:|");
    let cumulative = 0;
    for (const row of result.annualWithdrawals) {
      cumulative += row.withdrawn;
      lines.push(`| ${row.year} | $${formatMoney(row.withdrawn)} | $${formatMoney(cumulative)} |`);
    }
    lines.push("");
  }

  lines.push("## By Start Year");
  lines.push("");
  for (const summary of result.results) {
    lines.push(`### ${summary.year} -> ${summary.endYear}`);
    lines.push(`- Total gain: $${formatMoney(summary.totalGain)} (${formatPct(summary.totalGainPct)})`);
    lines.push("");
    lines.push("| Winner | Ticker | Gain % |");
    lines.push("|---|---|---:|");
    for (const w of summary.winners) {
      lines.push(`| ${w.name} | ${w.ticker} | ${formatPct(w.gainPct)} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SavePayload;
    if (!body?.params || !body?.result || !Array.isArray(body.result.results)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const baseName = buildBaseFileName(body);
    const { fileName, absolutePath } = await uniqueFilePath(baseName);
    const markdown = buildMarkdown(body, fileName);
    await writeFile(absolutePath, markdown, "utf8");

    const relativePath = path.relative(process.cwd(), absolutePath);
    return NextResponse.json({ ok: true, fileName, path: relativePath });
  } catch (err) {
    console.error("save-simulation API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
