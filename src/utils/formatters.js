export function formatCurrency(amount) {
    return '$' + Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatHours(hours) { return hours >= 100 ? hours.toFixed(0) + 'h' : hours.toFixed(1) + 'h'; }

export function fmtCost(amount) {
    return '$' + Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmtQty(n) {
    const num = Number(n || 0);
    if (Number.isInteger(num)) return num.toLocaleString('en-US');
    return num.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 4 });
}
export function fmtHrs(hours) {
    return Number(hours || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'h';
}
