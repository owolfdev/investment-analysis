export type NarrativeWinnerType = "stock" | "crypto asset" | "commodity";

export interface NarrativeWinner {
  name: string;
  ticker: string;
  type: NarrativeWinnerType;
  /** Relative narrative strength for the cohort year (0-100). */
  score: number;
  /** Normalized allocation weight for the cohort year (0-1, sums to 1 across winners). */
  weight: number;
}

export interface NarrativeWinnersPayload {
  year: number;
  winners: NarrativeWinner[];
  generatedAt: string; // ISO string
}
