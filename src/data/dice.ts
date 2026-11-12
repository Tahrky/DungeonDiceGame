import type { DieDefinition, DiceSymbol } from "../types/GameTypes";

const STANDARD_DIE_FACES: readonly DiceSymbol[] = [
    "invocation",
    "invocation",
    "invocation",
    "attack",
    "attack",
    "movement",
];

export const DICE: readonly DieDefinition[] = [1, 2, 3, 4, 5].map((number) => ({
    id: `standard-${number}`,
    faces: STANDARD_DIE_FACES,
}));

export const DICE_SYMBOLS: readonly DiceSymbol[] = ["invocation", "attack", "movement"];

export const DICE_SYMBOL_PRESENTATION: Record<DiceSymbol, { emoji: string; label: string }> = {
    invocation: { emoji: "🐍", label: "Invocation" },
    attack: { emoji: "⚔️", label: "Attaque" },
    movement: { emoji: "➡️", label: "Déplacement" },
};
