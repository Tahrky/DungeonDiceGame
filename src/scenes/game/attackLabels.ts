import { getAttackActionsPerTurn, getAttackCost, getAttackDamage } from "../../game/monsterActions";
import type { MonsterAttack, MonsterTurnBuffs, PlacedMonster } from "../../types/GameTypes";

const plural = (value: number, word: string) => `${word}${value === 1 ? "" : "s"}`;
const NEXT_MOVEMENT = "le prochain déplacement";
const NEXT_ATTACK = "la prochaine attaque";
const TURN_BUFF_LOG_LABELS: readonly [keyof MonsterTurnBuffs, string, (value: number) => string][] =
    [
        [
            "movementRangeBonus",
            NEXT_MOVEMENT,
            (value) => `déplacement +${value} ${plural(value, "case")}`,
        ],
        [
            "movementCostReduction",
            NEXT_MOVEMENT,
            (value) => `coût de déplacement -${value} ${plural(value, "symbole")}`,
        ],
        ["attackDamageBonus", NEXT_ATTACK, (value) => `dégâts +${value}`],
        [
            "attackCostReduction",
            NEXT_ATTACK,
            (value) => `coût d’attaque -${value} ${plural(value, "symbole")}`,
        ],
    ];

export function describeAppliedTurnBuff(buff: MonsterTurnBuffs): string {
    const effects: string[] = [];
    const actions = new Set<string>();
    for (const [key, action, label] of TURN_BUFF_LOG_LABELS) {
        const value = buff[key];
        if (value === undefined) continue;
        effects.push(label(value));
        actions.add(action);
    }
    return `${effects.join(", ")} pour ${[...actions].join(" et ")} ce tour`;
}

export function describeCooldownReduction(reducedCooldowns: number, reduction: number): string {
    const suffix = reducedCooldowns > 1 ? "s" : "";
    return `${reducedCooldowns} recharge${suffix} réduite${suffix} de ${reduction} ${plural(reduction, "tour")}`;
}

function getAttackPatternLabel(pattern: MonsterAttack["pattern"]): string {
    if (pattern.type === "jumpArea") {
        return `le carré 2×2 depuis une case à ${pattern.range} pas maximum`;
    }
    if (pattern.type === "area" || pattern.type === "directionalArea") {
        return `la zone ${pattern.width}×${pattern.depth}`;
    }
    if (pattern.type === "line" && pattern.allDirections) {
        const minRange = pattern.minRange ?? 1;
        const range =
            minRange === 1
                ? `portée maximale ${pattern.range}`
                : `portée ${minRange}–${pattern.range}`;
        return `la ligne de ${pattern.length ?? 1} cases (${range})`;
    }
    if (pattern.type === "line") return `la ligne de ${pattern.range} cases`;
    if (pattern.type === "radius") return `la zone circulaire de ${pattern.range} cases`;
    if (pattern.type === "selfRadius") {
        return `la zone circulaire autour de lui, jusqu’à ${pattern.range} cases`;
    }
    return "une cible au corps à corps";
}

function getAttackEffectLabel(attack: MonsterAttack, attacker: PlacedMonster): string {
    if (attack.healAmount !== undefined) return `soin ${attack.healAmount} PV`;
    if (attack.cooldownReduction !== undefined) {
        return `recharge -${attack.cooldownReduction} tour`;
    }
    const effects: string[] = [];
    if (attack.movementRangeBonus !== undefined) {
        effects.push(`déplacement +${attack.movementRangeBonus}`);
    }
    if (attack.movementCostReduction !== undefined) {
        effects.push(`coût ➡️ -${attack.movementCostReduction}`);
    }
    if (attack.attackDamageBonus !== undefined) {
        effects.push(`dégâts +${attack.attackDamageBonus}`);
    }
    if (attack.attackCostReduction !== undefined) {
        effects.push(`coût ⚔️ -${attack.attackCostReduction}`);
    }
    if (effects.length > 0) return `${effects.join(", ")} (ce tour)`;
    return `${getAttackDamage(attack, attacker.turnBuffs?.attackDamageBonus ?? 0)} dég.`;
}

function getAttackUsageStatus(
    useLimitReached: boolean,
    attacksRemaining: number,
    attacksUsed: number,
): string {
    if (useLimitReached) return " · utilisée ce tour";
    if (attacksRemaining === 0) return " · attaques épuisées";
    if (attacksUsed > 0)
        return ` · encore ${attacksRemaining} attaque${attacksRemaining > 1 ? "s" : ""}`;
    return "";
}

export function describeAttackButton(
    attacker: PlacedMonster,
    attack: MonsterAttack,
    attackIndex: number,
    availableAttackSymbols: number,
): { label: string; enabled: boolean } {
    const cost = getAttackCost(attack, attacker.turnBuffs?.attackCostReduction ?? 0);
    const cooldown = attacker.attackCooldowns[attackIndex] ?? 0;
    const attacksRemaining = Math.max(
        0,
        getAttackActionsPerTurn(attacker.monster) - attacker.attacksUsedThisTurn,
    );
    const useLimitReached =
        attack.usesPerTurn !== undefined &&
        (attacker.attackUsesThisTurn[attackIndex] ?? 0) >= attack.usesPerTurn;
    const recharge = cooldown > 0 ? ` · recharge ${cooldown} tour${cooldown === 1 ? "" : "s"}` : "";
    const usageStatus = getAttackUsageStatus(
        useLimitReached,
        attacksRemaining,
        attacker.attacksUsedThisTurn,
    );
    return {
        label: `${attack.name} — ${getAttackEffectLabel(attack, attacker)} — ${cost} ⚔️${recharge}${usageStatus}`,
        enabled:
            availableAttackSymbols >= cost &&
            cooldown === 0 &&
            attacksRemaining > 0 &&
            !useLimitReached,
    };
}

export function getAttackInstruction(attack: MonsterAttack | undefined): string {
    if (!attack) return "Choisis une attaque";
    if (attack.pattern.type === "directionalArea") {
        return `Clique autour du Pirate (frappe ${attack.pattern.width}×${attack.pattern.depth})`;
    }
    if (attack.targetsAlliesOnly) return "Clique un allié à portée";
    return `Clique une case de ${getAttackPatternLabel(attack.pattern)}`;
}
