// Utilities for formatting numbers and rates in EU style, shared by TradesTable and Sparkline

export function formatNumberEU(value: number, minDecimals = 0, maxDecimals = minDecimals): string {
    return value.toLocaleString('nl-NL', {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
    });
}

export function formatRate(num: number, have?: string, want?: string): string {
    if (!Number.isFinite(num)) return '—';
    if (num % 1 === 0) return formatNumberEU(num);
    if (num > 0 && num < 1 && have && want) {
        const denom = 1 / num;
        const rounded = Math.round(denom);
        if (Math.abs(denom - rounded) < 0.0005) {
            return `1/${formatNumberEU(rounded)}`;
        }
        let decimals: number;
        if (denom < 10) decimals = 2;
        else if (denom < 100) decimals = 1;
        else decimals = 0;
        let denomStr = formatNumberEU(denom, decimals, decimals);
        denomStr = denomStr.replace(/,(\d*?[1-9])0+$/, ',$1').replace(/,00$/, '');
        return `1/${denomStr}`;
    }
    return formatNumberEU(num, 2, 2);
}
