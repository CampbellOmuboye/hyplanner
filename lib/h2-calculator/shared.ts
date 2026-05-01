export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function ensureYearRange(start?: number, end?: number): { start: number; end: number } | null {
  if (!start || !end) return null;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end) return null;
  return { start: Math.floor(start), end: Math.floor(end) };
}

export function yearsInclusive(start: number, end: number): number[] {
  const ys: number[] = [];
  for (let y = start; y <= end; y += 1) ys.push(y);
  return ys;
}

export function naturalGasToMWh(value: number, unit: "m3" | "kWh" | "MWh" | "GWh"): number {
  switch (unit) {
    case "m3":
      return value * 0.0097694444;
    case "kWh":
      return value / 1000;
    case "MWh":
      return value;
    case "GWh":
      return value * 1000;
  }
}

export function hydrogenFromMWh(mwh: number): {
  hydrogen_volume_MWh: number;
  hydrogen_kg: number;
  hydrogen_ton: number;
  hydrogen_Nm3: number;
} {
  const hydrogen_volume_MWh = mwh;
  const hydrogen_kg = (hydrogen_volume_MWh * 1000) / 33.33;
  const hydrogen_ton = hydrogen_kg / 1000;
  const hydrogen_Nm3 = hydrogen_kg * 11.126;
  return { hydrogen_volume_MWh, hydrogen_kg, hydrogen_ton, hydrogen_Nm3 };
}
