export function formatCurrency(amount) {
    if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
    if (amount >= 1000) return '$' + (amount / 1000).toFixed(1) + 'K';
    return '$' + amount.toFixed(0);
}

export function formatHours(hours) { return hours >= 100 ? hours.toFixed(0) + 'h' : hours.toFixed(1) + 'h'; }

export function fmtCost(amount) {
    return '$' + Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmtQty(n) { return Number(n || 0).toLocaleString('en-US'); }
export function fmtHrs(hours) {
    return Number(hours || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'h';
}
