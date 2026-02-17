import { NextResponse } from "next/server";
import OpenAI from "openai";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import type { NarrativeWinner, NarrativeWinnersPayload } from "@/types/narrative-winners";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const NARRATIVE_WINNERS_SYSTEM = `You are an expert in financial history and market narratives. Your task is to identify "narrative winners" for a given year as they would have been perceived in January of the following year.

A narrative winner is an investment vehicle (stock, commodity, or crypto asset) that:
- Was widely discussed by analysts, journalists, and market commentators as having survived or led the year
- Was framed as well-positioned for the future, not merely having performed well
- Served as a symbol or reference point for a broader economic, technological, or monetary narrative
- Appeared repeatedly across mainstream financial media and institutional commentary

Exclude assets whose narratives were primarily speculative, controversial, or collapsing. Exclude fads without institutional endorsement. Use only information and sentiment that would have been available at that time (no hindsight).

Return exactly 3–4 items: mostly stocks (3–4 total), and optionally one commodity or crypto asset only if it was a strong contender that year (e.g. Bitcoin in 2017).`;

function buildUserPrompt(year: number): string {
  return `Identify the narrative winners for the year ${year}, as they would have been perceived in January ${year + 1}.

Reply with a JSON object with a single key "winners" whose value is an array. Each element must have exactly:
- "name": full company or asset name (e.g. "Apple Inc.", "Bitcoin")
- "ticker": ticker symbol (e.g. "AAPL", "BTC")
- "type": one of "stock", "crypto asset", or "commodity"
- "score": integer 0-100 representing narrative strength for that year (higher = stronger consensus)

Return no other text, only the JSON object.`;
}

function parseWinnersFromContent(content: string): NarrativeWinner[] {
  const trimmed = content.trim();
  const jsonStr = trimmed.startsWith("```") ? trimmed.replace(/^```(?:json)?\n?|\n?```$/g, "").trim() : trimmed;
  const raw = JSON.parse(jsonStr) as unknown;
  const arr = Array.isArray(raw) ? raw : (raw as { winners?: unknown[] }).winners ?? [];
  return arr.map((item: Record<string, unknown>) => ({
    name: String(item.name ?? ""),
    ticker: String(item.ticker ?? "").toUpperCase(),
    type: ["stock", "crypto asset", "commodity"].includes(String(item.type)) ? item.type as NarrativeWinner["type"] : "stock",
    score: Number(item.score ?? 0),
    weight: 0,
  }));
}

function normalizeTicker(raw: string, type: NarrativeWinner["type"]): string {
  const t = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (type === "crypto asset") {
    if (t === "BTC-USD" || t === "XBT" || t === "XBTUSD" || t === "BTCUSD") return "BTC";
  }
  if (type === "commodity") {
    if (t === "GC=F" || t === "XAUUSD" || t === "XAU" || t === "GOLD") return "GC";
  }
  if (type === "stock") {
    if (t === "BRK-A") return "BRK.A";
    if (t === "XON") return "XOM";
  }
  return t;
}

function normalizeAndValidateWinners(input: NarrativeWinner[]): NarrativeWinner[] {
  const normalized = input
    .map((w) => {
      const type: NarrativeWinner["type"] = ["stock", "crypto asset", "commodity"].includes(w.type)
        ? w.type
        : "stock";
      const name = String(w.name ?? "").trim();
      const ticker = normalizeTicker(String(w.ticker ?? ""), type);
      const scoreRaw = Number(w.score);
      const score = Number.isFinite(scoreRaw)
        ? Math.max(0, Math.min(100, Math.round(scoreRaw)))
        : 0;
      return { name, ticker, type, score, weight: 0 };
    })
    .filter((w) => w.name.length > 0 && /^[A-Z0-9.=/-]+$/.test(w.ticker));

  const deduped: NarrativeWinner[] = [];
  const seen = new Set<string>();
  for (const winner of normalized) {
    if (seen.has(winner.ticker)) continue;
    deduped.push(winner);
    seen.add(winner.ticker);
  }

  if (deduped.length < 3 || deduped.length > 4) {
    throw new Error(`Model returned ${deduped.length} valid winners; expected 3 or 4`);
  }

  const hasAnyScore = deduped.some((w) => w.score > 0);
  const fallbackScoresByCount: Record<number, number[]> = {
    3: [85, 76, 68],
    4: [85, 78, 72, 65],
  };
  const fallback = fallbackScoresByCount[deduped.length];
  const withScores = deduped.map((w, i) => ({
    ...w,
    score: hasAnyScore ? w.score : (fallback?.[i] ?? 70),
  }));

  const totalScore = withScores.reduce((sum, w) => sum + w.score, 0);
  if (totalScore <= 0) {
    const equalWeight = 1 / withScores.length;
    return withScores.map((w) => ({ ...w, weight: equalWeight }));
  }
  return withScores.map((w) => ({ ...w, weight: w.score / totalScore }));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const year = Number(body?.year);
    if (!Number.isInteger(year) || year < 1980 || year > 2030) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not set" }, { status: 500 });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: NARRATIVE_WINNERS_SYSTEM },
        { role: "user", content: buildUserPrompt(year) },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ error: "No response from OpenAI" }, { status: 502 });
    }

    let winners: NarrativeWinner[];
    try {
      const parsed = JSON.parse(content) as unknown;
      const arr = Array.isArray(parsed) ? parsed : (parsed as { winners?: unknown[] }).winners;
      if (!Array.isArray(arr)) throw new Error("Expected array");
      winners = arr.map((item: Record<string, unknown>) => ({
        name: String(item.name ?? ""),
        ticker: String(item.ticker ?? "").toUpperCase(),
        type: ["stock", "crypto asset", "commodity"].includes(String(item.type)) ? item.type as NarrativeWinner["type"] : "stock",
        score: Number(item.score ?? 0),
        weight: 0,
      }));
    } catch {
      winners = parseWinnersFromContent(content);
    }

    const winnersValidated = normalizeAndValidateWinners(winners);

    const payload: NarrativeWinnersPayload = {
      year,
      winners: winnersValidated,
      generatedAt: new Date().toISOString(),
    };

    const dataDir = path.join(process.cwd(), "data", "narrative-winners");
    await mkdir(dataDir, { recursive: true });
    const filePath = path.join(dataDir, `${year}.json`);
    await writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");

    return NextResponse.json(payload);
  } catch (err) {
    console.error("narrative-winners API error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error ? 400 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
