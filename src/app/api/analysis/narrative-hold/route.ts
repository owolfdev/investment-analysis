import { NextResponse } from "next/server";
import { narrativeHoldToEnd } from "@/lib/analysis";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get("year"));
    const endYear = Number(searchParams.get("endYear") ?? searchParams.get("end_year"));
    const perWinner = Number(searchParams.get("perWinner") ?? searchParams.get("per_winner") ?? 50);
    const vehiclesPerYearParam = searchParams.get("vehiclesPerYear") ?? searchParams.get("vehicles_per_year");
    const vehiclesPerYear = vehiclesPerYearParam != null && vehiclesPerYearParam !== ""
      ? Number(vehiclesPerYearParam)
      : null;

    if (!Number.isInteger(year) || year < 1980 || year > 2030) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 });
    }
    if (!Number.isInteger(endYear) || endYear < year || endYear > 2030) {
      return NextResponse.json({ error: "Invalid endYear" }, { status: 400 });
    }
    if (!Number.isFinite(perWinner) || perWinner <= 0) {
      return NextResponse.json({ error: "Invalid perWinner" }, { status: 400 });
    }
    if (vehiclesPerYear != null && (!Number.isInteger(vehiclesPerYear) || vehiclesPerYear < 1 || vehiclesPerYear > 4)) {
      return NextResponse.json({ error: "Invalid vehiclesPerYear (must be integer 1-4)" }, { status: 400 });
    }

    const summary = await narrativeHoldToEnd(
      year,
      endYear,
      perWinner,
      vehiclesPerYear != null ? { vehiclesPerYear } : undefined
    );
    return NextResponse.json(summary);
  } catch (err) {
    console.error("narrative-hold API error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = err instanceof Error ? 400 : 500;
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
