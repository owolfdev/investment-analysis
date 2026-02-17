import { readFile, writeFile } from "fs/promises";
import path from "path";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "dev_docs", "reports");
const SWEEP_PATH = path.join(REPORT_DIR, "strategy-sweep.json");
const REPORT_PATH = path.join(REPORT_DIR, "strategy-report.md");

function fmtPct(value) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(1)}%`;
}

function buildFallbackReport(payload) {
  const top = payload.rankedScenarios.slice(0, 5);
  const lines = [];
  lines.push("# Strategy Sweep Report");
  lines.push("");
  lines.push(`Generated: ${payload.generatedAt}`);
  lines.push("");
  lines.push("## Configuration");
  lines.push(`- Windows: ${payload.config.windowYears}-year, step ${payload.config.stepYears}-year`);
  lines.push(`- Start years: ${payload.config.windowStartMin} to ${payload.config.windowStartMax}`);
  lines.push(`- Per-winner amount: $${payload.config.perWinner}`);
  lines.push(`- Annual budget mode: $${payload.config.annualBudget}`);
  lines.push("");
  lines.push("## Top Scenarios");
  for (const s of top) {
    lines.push(`- ${s.rank}. ${s.id}: median CAGR ${fmtPct(s.medianCagrPct)}, median gain ${fmtPct(s.medianGainPct)}, median max drawdown ${fmtPct(s.medianMaxDrawdownPct)}, win rate ${fmtPct(s.winRatePct)}`);
  }
  lines.push("");
  lines.push("## Interpretation");
  lines.push("- Higher CAGR scenarios often come with higher drawdown and higher concentration risk.");
  lines.push("- Compare continuous vs front5 deployment to test your moon-shot capture hypothesis.");
  lines.push("- Validate top scenarios against implementation constraints (taxes, fees, position limits).");
  lines.push("");
  return lines.join("\n");
}

async function buildAIReport(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return buildFallbackReport(payload);
  }

  const top = payload.rankedScenarios.slice(0, 10).map((s) => ({
    rank: s.rank,
    id: s.id,
    vehiclesPerYear: s.vehiclesPerYear,
    deployment: s.deployment,
    contributionMode: s.contributionMode,
    windowsValid: s.windowsValid,
    medianCagrPct: s.medianCagrPct,
    medianGainPct: s.medianGainPct,
    medianMoic: s.medianMoic,
    medianMaxDrawdownPct: s.medianMaxDrawdownPct,
    winRatePct: s.winRatePct,
    worstGainPct: s.worstGainPct,
    bestGainPct: s.bestGainPct,
  }));

  const client = new OpenAI({ apiKey });
  const prompt = {
    config: payload.config,
    topScenarios: top,
    objective: "Discern ideal patterns for using fewer vs more tickers and front-loaded vs continuous contributions for long-run wealth building.",
    requiredSections: [
      "Executive Summary",
      "What Patterns Are Robust",
      "Fewer vs More Tickers",
      "Front-Loaded vs Continuous Contributions",
      "Recommended Default Configuration",
      "Risk Notes",
      "Next Tests"
    ]
  };

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a pragmatic quant research assistant. Write a concise, specific, human-readable markdown report. Avoid fluff. Use concrete metrics from input.",
        },
        {
          role: "user",
          content: `Write a report from this JSON:\n${JSON.stringify(prompt)}`,
        },
      ],
      temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return buildFallbackReport(payload);
    return content;
  } catch {
    return buildFallbackReport(payload);
  }
}

async function main() {
  const raw = await readFile(SWEEP_PATH, "utf8");
  const payload = JSON.parse(raw);
  const report = await buildAIReport(payload);
  await writeFile(REPORT_PATH, `${report.trim()}\n`, "utf8");
  console.log(`Wrote ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
