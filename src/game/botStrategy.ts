import type { DiceReserve, DiceSymbol, Monster, PlayerId, Position } from "../types/GameTypes";
import {
    getGridDistance,
    getMovementDistanceMap,
    getMovementPathMap,
    hasLineOfSight,
    type MovementOptions,
} from "./monsterActions";

export const BOT_PROFILES = [
    "balanced",
    "cheap",
    "expensive",
    "offensive",
    "support",
    "defensive",
    "tracker",
] as const;

export type BotProfile = (typeof BOT_PROFILES)[number];
export type BotTactic = "offense" | "hunt" | "balanced" | "defense";

export const BOT_PROFILE_LABELS: Record<BotProfile, string> = {
    balanced: "Polyvalent — adaptatif",
    cheap: "Monstres peu chers — adaptatif",
    expensive: "Monstres coûteux — adaptatif",
    offensive: "Offensif — victoire aux PV",
    support: "Soutien — adaptatif",
    defensive: "Défensif — périmètre",
    tracker: "Traqueur — élimination des monstres",
};

export interface TacticalAttackValue {
    damage: number;
    kills: number;
    statusDamage: number;
    baseDamage: number;
    healing: number;
    clearedEffects: number;
    buffs: number;
    cooldownsReduced: number;
    friendlyDamage: number;
}

export interface ObjectiveMovement {
    position: Position;
    path: Position[];
    routeProgress: number;
}

export interface SymbolConversionChoice {
    sourceSymbols: [DiceSymbol, DiceSymbol];
    targetSymbol: DiceSymbol;
}

export interface BotTacticDecision {
    tactic: BotTactic;
    description: string;
}

export function chooseBotTactic(
    profile: BotProfile,
    opponentProfile: BotProfile,
): BotTacticDecision {
    if (profile === "offensive") {
        return {
            tactic: "offense",
            description: "priorise les PV de la base adverse sans ignorer les menaces",
        };
    }
    if (profile === "tracker") {
        return { tactic: "hunt", description: "traque les monstres et protège sa base" };
    }
    if (profile === "defensive") {
        return {
            tactic: "defense",
            description: "protège son périmètre et avance quand il est sûr",
        };
    }

    const tactic: BotTactic =
        opponentProfile === "offensive"
            ? "defense"
            : opponentProfile === "tracker"
              ? "offense"
              : opponentProfile === "defensive"
                ? "balanced"
                : opponentProfile === "expensive"
                  ? "hunt"
                  : profile === "cheap"
                    ? "offense"
                    : "balanced";
    const descriptions: Record<BotTactic, string> = {
        offense: "attaque la base adverse pour contourner sa stratégie",
        hunt: "affaiblit les monstres coûteux de l’adversaire",
        balanced: "maintient une pression égale sur la base et les monstres",
        defense: "renforce son périmètre face à la pression sur sa base",
    };
    return {
        tactic,
        description: `s’adapte au profil « ${opponentProfile} » : ${descriptions[tactic]}`,
    };
}

export function canDeployMonsterForProfile(
    monster: Monster,
    profile: BotProfile,
    deployedCosts: readonly number[],
): boolean {
    if (profile !== "expensive") return true;
    if (deployedCosts.length === 0) return monster.cost === 2 || monster.cost === 3;
    return monster.cost > Math.max(...deployedCosts);
}

const SYMBOL_CONVERSION_PAIRS: readonly [DiceSymbol, DiceSymbol][] = [
    ["invocation", "invocation"],
    ["attack", "attack"],
    ["movement", "movement"],
    ["invocation", "attack"],
    ["invocation", "movement"],
    ["attack", "movement"],
];

export function chooseSymbolConversion(
    reserve: DiceReserve,
    opportunities: DiceReserve,
    protectedCounts: DiceReserve,
): SymbolConversionChoice | null {
    let bestChoice: SymbolConversionChoice | null = null;
    let bestOpportunity = 0;
    let bestSurplus = Number.NEGATIVE_INFINITY;

    for (const targetSymbol of ["invocation", "attack", "movement"] as const) {
        const opportunity = opportunities[targetSymbol];
        if (opportunity <= 0 || opportunity < bestOpportunity) continue;

        for (const sourceSymbols of SYMBOL_CONVERSION_PAIRS) {
            if (sourceSymbols.includes(targetSymbol)) continue;

            const remaining = { ...reserve };
            remaining[sourceSymbols[0]]--;
            remaining[sourceSymbols[1]]--;
            if (
                remaining[sourceSymbols[0]] < protectedCounts[sourceSymbols[0]] ||
                remaining[sourceSymbols[1]] < protectedCounts[sourceSymbols[1]]
            ) {
                continue;
            }

            const surplus = sourceSymbols.reduce(
                (total, symbol) => total + remaining[symbol] - protectedCounts[symbol],
                0,
            );
            if (opportunity === bestOpportunity && surplus <= bestSurplus) continue;

            bestChoice = { sourceSymbols: [...sourceSymbols], targetSymbol };
            bestOpportunity = opportunity;
            bestSurplus = surplus;
        }
    }

    return bestChoice;
}

function supportValue(monster: Monster): number {
    return monster.attacks.reduce((score, attack) => {
        if (!attack.targetsAlliesOnly) return score;
        return (
            score +
            (attack.healAmount ?? 0) * 2 +
            (attack.cooldownReduction ?? 0) +
            (attack.movementRangeBonus ?? 0) +
            (attack.movementCostReduction ?? 0) +
            (attack.attackDamageBonus ?? 0) * 2 +
            (attack.attackCostReduction ?? 0) +
            (attack.clearsStatusEffects ? 1 : 0)
        );
    }, 0);
}

function offenseValue(monster: Monster): number {
    return monster.attacks.reduce((score, attack) => {
        const area = attack.pattern.type === "directionalArea" || attack.hitsAllies ? 1.5 : 1;
        const statusDamage = attack.statusEffect?.damagePerTurn ?? 0;
        return score + ((attack.damage + statusDamage) * area) / Math.max(1, attack.cost);
    }, 0);
}

export function scoreMonsterForProfile(monster: Monster, profile: BotProfile): number {
    switch (profile) {
        case "cheap":
            return -monster.cost;
        case "expensive":
            return monster.cost;
        case "offensive":
            return offenseValue(monster) * 4 + monster.hp * 0.1 - monster.cost * 0.15;
        case "support":
            return supportValue(monster) * 10 + offenseValue(monster) * 0.1 - monster.cost * 0.1;
        case "defensive":
            return offenseValue(monster) * 2 + monster.hp * 0.6 - monster.cost * 0.1;
        case "tracker":
            return offenseValue(monster) * 4 + monster.hp * 0.1 - monster.cost * 0.15;
        case "balanced":
            return 5 - Math.abs(monster.cost - 4) + monster.hp * 0.1;
    }
}

export function chooseDeck(
    monsters: readonly Monster[],
    profile: BotProfile,
    deckSize: number,
    random: () => number = Math.random,
): string[] {
    const remaining = [...monsters].sort(
        (first, second) =>
            scoreMonsterForProfile(second, profile) - scoreMonsterForProfile(first, profile) ||
            first.id.localeCompare(second.id),
    );
    const deck: string[] = [];

    while (deck.length < deckSize && remaining.length > 0) {
        const previousCost =
            deck.length === 0
                ? 0
                : (monsters.find((monster) => monster.id === deck[deck.length - 1])?.cost ?? 0);
        const preferredCandidates =
            profile !== "expensive"
                ? remaining
                : remaining.filter((monster) =>
                      deck.length === 0
                          ? monster.cost === 2 || monster.cost === 3
                          : monster.cost > previousCost,
                  );
        const candidates =
            preferredCandidates.length > 0 ? preferredCandidates : remaining;
        if (candidates.length === 0) break;
        const totalWeight = candidates.reduce((total, _monster, rank) => total + 1 / (rank + 1), 0);
        let selection = Math.max(0, Math.min(1 - Number.EPSILON, random())) * totalWeight;
        let selectedIndex = candidates.length - 1;
        for (let rank = 0; rank < candidates.length; rank++) {
            selection -= 1 / (rank + 1);
            if (selection < 0) {
                selectedIndex = rank;
                break;
            }
        }

        const selected = candidates[selectedIndex]!;
        deck.push(selected.id);
        remaining.splice(remaining.indexOf(selected), 1);
    }

    return deck;
}

export function describeDeploymentChoice(monster: Monster, profile: BotProfile): string {
    switch (profile) {
        case "cheap":
            return `profil cheap : privilégie le coût bas (${monster.cost})`;
        case "expensive":
            return `profil expensive : privilégie le coût élevé (${monster.cost})`;
        case "offensive":
            return `profil offensive : valeur offensive ${offenseValue(monster).toFixed(2)}`;
        case "support":
            return `profil support : valeur de soutien ${supportValue(monster)}`;
        case "defensive":
            return `profil défensif : privilégie les PV et les attaques, coût ${monster.cost}`;
        case "tracker":
            return `profil traqueur : privilégie les attaques contre les monstres, coût ${monster.cost}`;
        case "balanced":
            return `profil balanced : choix polyvalent, coût ${monster.cost}, ${monster.hp} PV`;
    }
}

export function scoreTerritoryExpansion(
    player: PlayerId,
    candidateCells: readonly Position[],
    ownedCells: readonly Position[],
    startingPosition: Position,
    enemyStartingPosition: Position,
): number {
    const ownedKeys = new Set([startingPosition, ...ownedCells].map(({ x, y }) => `${x},${y}`));
    const newCells = candidateCells.filter(({ x, y }) => !ownedKeys.has(`${x},${y}`));
    if (newCells.length === 0) return Number.NEGATIVE_INFINITY;

    const currentDistance = Math.min(
        getGridDistance(startingPosition, enemyStartingPosition),
        ...ownedCells.map((cell) => getGridDistance(cell, enemyStartingPosition)),
    );
    const nextDistance = Math.min(
        ...newCells.map((cell) => getGridDistance(cell, enemyStartingPosition)),
    );
    const objectiveProgress = currentDistance - nextDistance;

    const currentFrontier =
        player === 1
            ? Math.max(startingPosition.x, ...ownedCells.map(({ x }) => x))
            : Math.min(startingPosition.x, ...ownedCells.map(({ x }) => x));
    const nextFrontier =
        player === 1
            ? Math.max(...newCells.map(({ x }) => x))
            : Math.min(...newCells.map(({ x }) => x));
    const forwardProgress =
        player === 1 ? nextFrontier - currentFrontier : currentFrontier - nextFrontier;

    return objectiveProgress * 100 + forwardProgress * 5 + newCells.length;
}

export function scoreDefensivePlacement(
    position: Position,
    ownBase: Position,
    enemyPositions: readonly Position[],
    blockingCells: readonly Position[],
): number {
    return createDefensivePlacementScorer(ownBase, enemyPositions, blockingCells)(position);
}

export function createDefensivePlacementScorer(
    ownBase: Position,
    enemyPositions: readonly Position[],
    blockingCells: readonly Position[],
): (position: Position) => number {
    const visibleEnemies = enemyPositions.filter((enemy) =>
        hasLineOfSight(enemy, ownBase, blockingCells),
    );
    return (position) => {
        const blockers = [...blockingCells, position];
        const protectedSightlines = visibleEnemies.filter(
            (enemy) => !hasLineOfSight(enemy, ownBase, blockers),
        ).length;
        const blockedApproaches = enemyPositions.filter(
            (enemy) =>
                getGridDistance(enemy, ownBase) ===
                getGridDistance(enemy, position) + getGridDistance(position, ownBase),
        ).length;
        const perimeterDistance = Math.abs(getGridDistance(position, ownBase) - 3);

        return protectedSightlines * 100 + blockedApproaches * 10 - perimeterDistance * 2;
    };
}

export function chooseBotObjective(
    tactic: BotTactic | BotProfile,
    source: Position,
    enemyBase: Position,
    enemyPositions: readonly Position[],
    ownBase: Position = source,
): Position {
    if (tactic === "defense" || tactic === "defensive") {
        const baseIsThreatened = enemyPositions.some(
            (enemy) => getGridDistance(enemy, ownBase) <= 4,
        );
        return baseIsThreatened ? ownBase : enemyBase;
    }
    if (tactic !== "hunt" && tactic !== "tracker") return enemyBase;
    if (enemyPositions.length === 0) return enemyBase;

    return enemyPositions.reduce((closest, candidate) =>
        getGridDistance(source, candidate) < getGridDistance(source, closest) ? candidate : closest,
    );
}

export function scoreTacticalAttack(
    value: TacticalAttackValue,
    cost: number,
    tactic: BotTactic | BotProfile,
    enemyBaseHealth: number,
    profile?: BotProfile,
): number {
    const isOffense = tactic === "offense" || tactic === "offensive" || profile === "offensive";
    const isHunt = tactic === "hunt" || tactic === "tracker" || profile === "tracker";
    const isSupport = tactic === "support" || profile === "support";
    const baseUrgency = enemyBaseHealth <= 1 ? 14 : enemyBaseHealth <= 2 ? 10 : 8;
    const basePreference = isOffense ? 1.5 : isHunt ? 0.9 : 1;
    const damagePreference = isHunt ? 3 : isOffense ? 1.5 : 2;
    const killPreference = isHunt ? 24 : isOffense ? 10 : 8;
    const supportPreference = isSupport ? 2 : 1;
    const supportValue =
        value.healing * 2 + value.clearedEffects * 2 + value.buffs * 2 + value.cooldownsReduced * 2;
    const score =
        value.baseDamage * baseUrgency * basePreference +
        value.damage * damagePreference +
        value.statusDamage * 1.5 +
        value.kills * killPreference +
        supportValue * supportPreference -
        value.friendlyDamage * 4;
    const effectiveProfile =
        profile ?? (tactic === "cheap" || tactic === "expensive" ? tactic : undefined);
    const costBias =
        effectiveProfile === "cheap" ? 1.5 : effectiveProfile === "expensive" ? 0.25 : 0.5;

    return Math.max(0, score) / (Math.max(0, cost) + costBias);
}

export function findObjectiveMovement(
    options: MovementOptions,
    ownedCells: readonly Position[],
    objective: Position,
    enemyPositions: readonly Position[] = [],
    tactic: BotTactic = "balanced",
): ObjectiveMovement | null {
    const getKey = ({ x, y }: Position): string => `${x},${y}`;
    const occupied = new Set(options.occupiedCells.map(getKey));
    const blocked = new Set(options.blockedCells.map(getKey));
    const hostile = new Set((options.hostileCells ?? []).map(getKey));
    const goalCells = [...new Map(ownedCells.map((cell) => [getKey(cell), cell])).values()]
        .filter(
            (cell) =>
                !occupied.has(getKey(cell)) &&
                !blocked.has(getKey(cell)) &&
                (options.canPassHostiles || !hostile.has(getKey(cell))),
        )
        .sort(
            (first, second) =>
                getGridDistance(first, objective) - getGridDistance(second, objective),
        );
    const nearestGoal = goalCells[0];
    if (!nearestGoal) return null;

    const nearestGoalDistance = getGridDistance(nearestGoal, objective);
    const frontier = goalCells.filter(
        (cell) => getGridDistance(cell, objective) === nearestGoalDistance,
    );
    const distances = getMovementDistanceMap(frontier, options);
    const paths = getMovementPathMap(options);
    const currentDistance = distances.get(getKey(options.source));
    if (currentDistance === undefined) return null;

    let best: ObjectiveMovement | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    const candidates = [
        ...new Map(options.deployedCells.map((cell) => [getKey(cell), cell])).values(),
    ];
    for (const destination of candidates) {
        if (getKey(destination) === getKey(options.source)) continue;
        const routeDistance = distances.get(getKey(destination));
        if (routeDistance === undefined) continue;

        const routeProgress = currentDistance - routeDistance;
        const objectiveProgress =
            getGridDistance(options.source, objective) - getGridDistance(destination, objective);
        const enemyProgress =
            tactic === "hunt" && enemyPositions.length
                ? Math.min(
                      ...enemyPositions.map((enemy) => getGridDistance(options.source, enemy)),
                  ) -
                  Math.min(...enemyPositions.map((enemy) => getGridDistance(destination, enemy)))
                : 0;
        if (routeProgress <= 0 && objectiveProgress <= 0 && enemyProgress <= 0) {
            continue;
        }

        const path = paths.get(getKey(destination)) ?? [];
        if (path.length < 2) continue;

        const score = objectiveProgress * 100 + enemyProgress * 60 + routeProgress * 10;
        if (score <= bestScore) continue;
        bestScore = score;
        best = { position: destination, path, routeProgress };
    }
    return best;
}
