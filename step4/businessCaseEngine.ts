export type CashFlow = { net_cash_flow: number }

/**
 * Port of `backend/src/results/businessCaseEngine.py` helper functions.
 *
 * This module is intentionally additive: it does not change any runtime wiring yet.
 * The goal is to port the calculation logic into TypeScript incrementally.
 */

export type PaybackPeriod = readonly [years: number, months: number]

export function calculatePaybackPeriod(cashflows: CashFlow[]): PaybackPeriod {
  if (!cashflows || cashflows.length === 0) return [0, 0]

  // Start with year 0 investment (negative)
  let cumulative = cashflows[0].net_cash_flow

  // If initial investment is positive or zero, payback is immediate
  if (cumulative >= 0) return [0, 0]

  // Track cumulative cash flow year by year
  for (let i = 1; i < cashflows.length; i++) {
    const yearCf = cashflows[i].net_cash_flow
    const cumulativeBefore = cumulative
    cumulative += yearCf

    // Check if we've crossed zero this year
    if (cumulative >= 0) {
      // Payback occurs during this year (year i)
      // Interpolate to find the month
      if (yearCf === 0) {
        // No cash flow this year, payback at end of previous year
        return [i - 1, 11]
      }

      // cumulativeBefore is negative, recover abs(cumulativeBefore) from yearCf
      let fractionOfYear = Math.abs(cumulativeBefore) / Math.abs(yearCf)
      // Clamp to [0, 1] to handle edge cases
      fractionOfYear = Math.max(0, Math.min(1, fractionOfYear))

      // Convert to months (0-11)
      let months = Math.trunc(fractionOfYear * 12)
      if (months === 12) months = 11

      return [i, months]
    }
  }

  // Never reached payback within project lifetime
  if (cashflows.length > 1) return [cashflows.length - 1, 11]
  return [0, 0]
}

export function calculateDiscountedPaybackPeriod(
  cashflows: CashFlow[],
  discountRate: number
): PaybackPeriod {
  if (!cashflows || cashflows.length === 0) return [0, 0]

  // Guard against invalid discount rates that would make discounting undefined
  if (discountRate <= -1.0) return [0, 0]

  const discValues = cashflows.map((cf, i) => cf.net_cash_flow / (1.0 + discountRate) ** i)

  let cumulative = discValues[0]
  if (cumulative >= 0) return [0, 0]

  for (let i = 1; i < discValues.length; i++) {
    const yearPv = discValues[i]
    const cumulativeBefore = cumulative
    cumulative += yearPv

    if (cumulative >= 0) {
      if (yearPv === 0) return [i - 1, 11]

      let fractionOfYear = Math.abs(cumulativeBefore) / Math.abs(yearPv)
      fractionOfYear = Math.max(0, Math.min(1, fractionOfYear))

      let months = Math.trunc(fractionOfYear * 12)
      if (months === 12) months = 11

      return [i, months]
    }
  }

  if (discValues.length > 1) return [discValues.length - 1, 11]
  return [0, 0]
}

export function npv(rate: number, cashflows: number[]): number {
  if (!cashflows || cashflows.length === 0) return 0
  // Same definition as Python: sum(cf_t / (1 + rate)^t)
  return cashflows.reduce((acc, cf, t) => acc + cf / (1.0 + rate) ** t, 0)
}

/**
 * IRR via bisection, matching the Python intent: find rate where NPV(rate)=0.
 * Returns 0.0 if it fails to converge.
 */
export function irr(
  cashflows: number[],
  options?: {
    /** Max iterations for bisection (default 1000) */
    maxIter?: number
    /** Absolute NPV tolerance (default 1e-6) */
    tol?: number
    /** Lower bracket bound (default -0.9999) */
    low?: number
    /** Upper bracket bound (default 10.0) */
    high?: number
  }
): number {
  const maxIter = options?.maxIter ?? 1000
  const tol = options?.tol ?? 1e-6
  let low = options?.low ?? -0.9999
  let high = options?.high ?? 10.0

  if (!cashflows || cashflows.length === 0) return 0.0

  let npvLow = npv(low, cashflows)
  let npvHigh = npv(high, cashflows)

  // If no sign change, IRR is not bracketed; return 0.0 (same “best effort” behavior)
  if (npvLow === 0) return low
  if (npvHigh === 0) return high
  if (npvLow * npvHigh > 0) return 0.0

  for (let i = 0; i < maxIter; i++) {
    const mid = (low + high) / 2.0
    const npvMid = npv(mid, cashflows)

    if (Math.abs(npvMid) < tol) return mid

    // Keep the bracket that contains the root
    if (npvLow * npvMid <= 0) {
      high = mid
      npvHigh = npvMid
    } else {
      low = mid
      npvLow = npvMid
    }
  }

  // Fallback: best estimate after iterations
  return (low + high) / 2.0
}

