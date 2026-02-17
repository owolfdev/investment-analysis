import { readdir, readFile } from "fs/promises";
import path from "path";
import type { NarrativeWinner, NarrativeWinnersPayload } from "@/types/narrative-winners";

const NARRATIVE_WINNERS_DIR = path.join(process.cwd(), "data", "narrative-winners");

/**
 * Reads all narrative-winners JSON files and returns payloads (year + winners).
 * Skips non-JSON and invalid files.
 */
export async function loadAllNarrativeWinners(): Promise<NarrativeWinnersPayload[]> {
  const dir = NARRATIVE_WINNERS_DIR;
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const jsonFiles = entries.filter((f) => f.endsWith(".json") && /^\d{4}\.json$/.test(f));
  const payloads: NarrativeWinnersPayload[] = [];
  for (const file of jsonFiles.sort()) {
    try {
      const raw = await readFile(path.join(dir, file), "utf-8");
      const data = JSON.parse(raw) as NarrativeWinnersPayload;
      if (typeof data?.year === "number" && Array.isArray(data?.winners)) {
        payloads.push(data);
      }
    } catch {
      // skip invalid files
    }
  }
  return payloads;
}

/**
 * Unique set of tickers across all narrative-winners files.
 */
export async function getTickerSet(): Promise<Set<string>> {
  const payloads = await loadAllNarrativeWinners();
  const set = new Set<string>();
  for (const p of payloads) {
    for (const w of p.winners) {
      if (w.ticker?.trim()) set.add(w.ticker.trim().toUpperCase());
    }
  }
  return set;
}

/**
 * Array of unique tickers (sorted) from all narrative-winners files.
 */
export async function getTickerList(): Promise<string[]> {
  const set = await getTickerSet();
  return Array.from(set).sort();
}

/**
 * Min and max year represented by narrative-winners files.
 * Returns { min, max } or null if no files.
 */
export async function getYearRange(): Promise<{ min: number; max: number } | null> {
  const payloads = await loadAllNarrativeWinners();
  if (payloads.length === 0) return null;
  const years = payloads.map((p) => p.year);
  return { min: Math.min(...years), max: Math.max(...years) };
}

/**
 * Narrative winners for a single year (from the file data/narrative-winners/{year}.json if present).
 */
export async function getWinnersByYear(year: number): Promise<NarrativeWinner[]> {
  const payloads = await loadAllNarrativeWinners();
  const found = payloads.find((p) => p.year === year);
  return found ? found.winners : [];
}
