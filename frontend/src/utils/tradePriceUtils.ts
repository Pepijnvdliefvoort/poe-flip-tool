// Utility functions for price/fraction/undercut logic from TradesTable

// Helper: reduce a fraction
type Fraction = { num: number, den: number };
export function gcd(a: number, b: number): number {
    return b === 0 ? a : gcd(b, a % b);
}

export function toReducedFraction(x: number, maxDen: number = 100): Fraction | null {
    let bestNum = 1, bestDen = 1, bestError = Math.abs(x - 1);
    for (let den = 1; den <= maxDen; den++) {
        let num = Math.round(x * den);
        let error = Math.abs(x - num / den);
        if (error < bestError) {
            bestNum = num;
            bestDen = den;
            bestError = error;
        }
        if (error < 1e-6) break;
    }
    const d = gcd(bestNum, bestDen);
    return { num: bestNum / d, den: bestDen / d };
}

export function getFractionUndercut(rate: number, bestRateFraction: string, pairListings: { rate: number }[]): { value: string, display: string } | null {
    // If we have a bestRateFraction, use its denominator
    if (bestRateFraction && pairListings) {
        const m = bestRateFraction.match(/^1\/(\d+)$/);
        if (m) {
            const denom = parseInt(m[1], 10);
            // Collect all denominators in listings of the form 1/N
            const usedDenoms = new Set<number>();
            for (const l of pairListings) {
                if (l.rate > 0 && l.rate < 1) {
                    const d = Math.round(1 / l.rate);
                    if (Math.abs(l.rate - 1 / d) < 1e-8) {
                        usedDenoms.add(d);
                    }
                }
            }
            // Find the next unused denominator after denom
            let nextDenom = denom + 1;
            while (usedDenoms.has(nextDenom)) {
                nextDenom++;
            }
            return { value: `1/${nextDenom}`, display: `1/${nextDenom}` };
        }
    }
    // For rates > 1 and not whole, suggest closest reduced fraction
    if (rate > 1 && rate % 1 !== 0) {
        const frac = toReducedFraction(rate, 100);
        if (frac && frac.den !== 1) {
            return { value: `${frac.num}/${frac.den}`, display: `${frac.num}/${frac.den}` };
        }
    }
    for (let N = 2; N <= 10000; N++) {
        if (Math.abs(rate - 1 / N) < 1e-8) {
            // Suggest 1/(N+1) as the undercut
            return { value: `1/${N + 1}`, display: `1/${N + 1}` };
        }
    }
    return null;
}
