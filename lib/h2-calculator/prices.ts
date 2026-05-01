import type { PriceScenario } from "./types";

type Scenario3 = Exclude<PriceScenario, "All">;

/**
 * Desk-calculator 1.0: CO₂ price (EUR/ton) by year and scenario.
 * Replace with market/ETS data when upgrading beyond 1.0.
 */
const CO2_EUR_PER_TON: Record<number, Record<Scenario3, number>> = {
  2026: { Low: 65, Medium: 95, High: 130 },
  2027: { Low: 68, Medium: 100, High: 138 },
  2028: { Low: 72, Medium: 105, High: 145 },
  2029: { Low: 75, Medium: 110, High: 152 },
  2030: { Low: 78, Medium: 115, High: 160 },
  2031: { Low: 82, Medium: 120, High: 168 },
  2032: { Low: 85, Medium: 125, High: 175 },
  2033: { Low: 88, Medium: 130, High: 182 },
  2034: { Low: 92, Medium: 135, High: 190 },
  2035: { Low: 95, Medium: 140, High: 198 },
  2036: { Low: 98, Medium: 145, High: 205 },
  2037: { Low: 102, Medium: 150, High: 212 },
  2038: { Low: 105, Medium: 155, High: 220 },
  2039: { Low: 108, Medium: 160, High: 228 },
  2040: { Low: 112, Medium: 165, High: 235 },
};

function nearestCo2Row(year: number): Record<Scenario3, number> {
  const keys = Object.keys(CO2_EUR_PER_TON)
    .map(Number)
    .sort((a, b) => a - b);
  if (keys.length === 0) return { Low: 70, Medium: 100, High: 140 };
  if (year <= keys[0]) return CO2_EUR_PER_TON[keys[0]];
  if (year >= keys[keys.length - 1]) return CO2_EUR_PER_TON[keys[keys.length - 1]];
  let lo = keys[0];
  for (const y of keys) {
    if (y <= year) lo = y;
    else break;
  }
  return CO2_EUR_PER_TON[lo] ?? { Low: 70, Medium: 100, High: 140 };
}

export function co2_price(year: number, scenario: Scenario3): number {
  return nearestCo2Row(year)[scenario];
}

export function expandScenario(s: PriceScenario): Scenario3[] {
  return s === "All" ? ["Low", "Medium", "High"] : [s];
}
