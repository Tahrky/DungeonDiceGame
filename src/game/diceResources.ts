import type { DiceReserve, DiceSymbol, RolledDie } from "../types/GameTypes";

export function createEmptyDiceReserve(): DiceReserve {
    return { invocation: 0, attack: 0, movement: 0 };
}

export function getAvailableSymbolCount(
    symbol: DiceSymbol,
    rolledDice: readonly RolledDie[],
    reserve: DiceReserve,
): number {
    const rolledCount = rolledDice.filter(
        (die) => die.symbol === symbol && die.status === "available",
    ).length;
    return rolledCount + reserve[symbol];
}

export function storeRolledDie(
    rolledDice: RolledDie[],
    dieIndex: number,
    reserve: DiceReserve,
): boolean {
    const die = rolledDice[dieIndex];
    if (!die || die?.status !== "available") return false;

    die.status = "stored";
    reserve[die.symbol]++;
    return true;
}

export function storeRemainingDice(rolledDice: RolledDie[], reserve: DiceReserve): void {
    for (const die of rolledDice) {
        if (die.status !== "available") continue;

        die.status = "stored";
        reserve[die.symbol]++;
    }
}

export function spendSymbols(
    symbol: DiceSymbol,
    amount: number,
    rolledDice: RolledDie[],
    reserve: DiceReserve,
): boolean {
    if (!Number.isInteger(amount) || amount < 0) return false;
    if (getAvailableSymbolCount(symbol, rolledDice, reserve) < amount) return false;

    let remaining = amount;
    for (const die of rolledDice) {
        if (remaining === 0) break;
        if (die.symbol !== symbol || die.status !== "available") continue;

        die.status = "spent";
        remaining--;
    }

    if (remaining > 0) reserve[symbol] -= remaining;
    return true;
}
