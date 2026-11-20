export function formatElapsedDuration(elapsedMs: number): string {
    const nonNegativeElapsedMs = Math.max(0, elapsedMs);
    const tenthsOfSeconds = Math.round(nonNegativeElapsedMs / 100);
    if (tenthsOfSeconds < 600) {
        return `${new Intl.NumberFormat("fr-FR", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
        }).format(tenthsOfSeconds / 10)} s`;
    }

    const totalSeconds = Math.round(nonNegativeElapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours} h ${minutes} min ${seconds} s`;
    return `${minutes} min ${seconds} s`;
}
