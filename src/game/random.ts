export function createSeededRandom(seed: number): () => number {
    let value = seed || 0x6d2b79f5;
    return () => {
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        return (value >>> 0) / 0x1_0000_0000;
    };
}

export function pickIndex(random: number, length: number): number {
    const unit = Math.max(0, Math.min(1 - Number.EPSILON, random));
    return Math.min(length - 1, Math.floor(unit * length));
}

export function shuffle<T>(items: readonly T[], random?: () => number): T[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = pickIndex(random?.() ?? 0.5, index + 1);
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
    }
    return shuffled;
}
