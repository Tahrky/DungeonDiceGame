import type { Monster } from "../types/GameTypes";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function getUniqueMonsterSymbols(
    monsters: readonly Pick<Monster, "id" | "symbol">[],
): Map<string, string> {
    const usedSymbols = new Set<string>();
    const symbols = new Map<string, string>();

    for (const monster of monsters) {
        const preferred = monster.symbol;
        const symbol =
            /^[A-Z]$/.test(preferred) && !usedSymbols.has(preferred)
                ? preferred
                : [...LETTERS].find((letter) => !usedSymbols.has(letter));
        if (!symbol) throw new RangeError("Chaque monstre doit avoir une lettre distincte.");
        usedSymbols.add(symbol);
        symbols.set(monster.id, symbol);
    }

    return symbols;
}

export function getMonsterSymbol(symbols: ReadonlyMap<string, string>, monsterId: string): string {
    const symbol = symbols.get(monsterId);
    if (!symbol) throw new Error(`Aucune lettre attribuée au monstre ${monsterId}.`);
    return symbol;
}
