import type { DiceReserve, DiceSymbol, DieDefinition, RolledDie } from "../types/GameTypes";

export function getRollableDieFaces(
    die: DieDefinition,
    excludeInvocation: boolean,
): readonly DiceSymbol[] {
    return excludeInvocation ? die.faces.filter((symbol) => symbol !== "invocation") : die.faces;
}

export function createEmptyDiceReserve(): DiceReserve {
    return { invocation: 0, attack: 0, movement: 0 };
}

export function addSymbolsToReserve(reserve: DiceReserve, amountPerSymbol: number): void {
    if (!Number.isInteger(amountPerSymbol) || amountPerSymbol < 0) {
        throw new RangeError("Le nombre de symboles à ajouter doit être un entier positif.");
    }

    reserve.invocation += amountPerSymbol;
    reserve.attack += amountPerSymbol;
    reserve.movement += amountPerSymbol;
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

export function convertReservedSymbols(
    reserve: DiceReserve,
    selectedSymbols: readonly DiceSymbol[],
    targetSymbol: DiceSymbol,
): boolean {
    if (selectedSymbols.length !== 2) return false;
    const [firstSymbol, secondSymbol] = selectedSymbols;
    if (!firstSymbol || !secondSymbol) return false;
    if (selectedSymbols.includes(targetSymbol)) return false;
    if (firstSymbol === secondSymbol) {
        if (reserve[firstSymbol] < 2) return false;
    } else if (reserve[firstSymbol] < 1 || reserve[secondSymbol] < 1) {
        return false;
    }

    reserve[firstSymbol]--;
    reserve[secondSymbol]--;
    reserve[targetSymbol]++;
    return true;
}
