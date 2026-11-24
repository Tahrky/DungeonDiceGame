import type { DiceReserve, DiceSymbol, Monster, PlayerId, Position } from "../types/GameTypes";
import {
    getGridDistance,
    getMovementDistanceMap,
    hasLineOfSight,
    type MovementOptions,
} from "./monsterActions";
import {
    analyzeLegalMovementRoutes,
    analyzePotentialRoutes,
    getShortestRouteDistance,
} from "./routeAnalysis";

export const BOT_PROFILES = [
    "balanced",
    "cheap",
    "expensive",
    "offensive",
    "support",
    "defensive",
    "tracker",
    "random",
    "random-deck",
    "random-strategy",
    "greedy",
] as const;

export type BotProfile = (typeof BOT_PROFILES)[number];
export type BotTactic = "offense" | "hunt" | "balanced" | "defense";

export interface BotStrategyWeights {
    baseDamage: number;
    damage: number;
    statusDamage: number;
    kills: number;
    support: number;
    friendlyDamage: number;
    costEfficiency: number;
    monsterOffense: number;
    monsterSupport: number;
    monsterDurability: number;
    monsterCost: number;
    invocationPriority: number;
    territoryExpansion: number;
    defensivePlacement: number;
    pathBlockade: number;
    routeDenial: number;
    routeRedundancy: number;
    chokepointControl: number;
    strategicPlacement: number;
    movementObjective: number;
    movementHunt: number;
    movementRoute: number;
    movementThreat: number;
    defensiveCoverage: number;
    formationCohesion: number;
    interception: number;
}

export type BotStrategyWeightMap = Partial<Record<BotProfile, BotStrategyWeights>>;

export const BOT_STRATEGY_WEIGHT_KEYS = [
    "baseDamage",
    "damage",
    "statusDamage",
    "kills",
    "support",
    "friendlyDamage",
    "costEfficiency",
    "monsterOffense",
    "monsterSupport",
    "monsterDurability",
    "monsterCost",
    "invocationPriority",
    "territoryExpansion",
    "defensivePlacement",
    "pathBlockade",
    "routeDenial",
    "routeRedundancy",
    "chokepointControl",
    "strategicPlacement",
    "movementObjective",
    "movementHunt",
    "movementRoute",
    "movementThreat",
    "defensiveCoverage",
    "formationCohesion",
    "interception",
] as const satisfies readonly (keyof BotStrategyWeights)[];

export const DEFAULT_BOT_STRATEGY_WEIGHTS: Readonly<BotStrategyWeights> = Object.freeze({
    baseDamage: 1,
    damage: 1,
    statusDamage: 1,
    kills: 1,
    support: 1,
    friendlyDamage: 1,
    costEfficiency: 1,
    monsterOffense: 1,
    monsterSupport: 1,
    monsterDurability: 1,
    monsterCost: 1,
    invocationPriority: 1,
    territoryExpansion: 1,
    defensivePlacement: 1,
    pathBlockade: 1,
    routeDenial: 1,
    routeRedundancy: 1,
    chokepointControl: 1,
    strategicPlacement: 1,
    movementObjective: 1,
    movementHunt: 1,
    movementRoute: 1,
    movementThreat: 1,
    defensiveCoverage: 1,
    formationCohesion: 1,
    interception: 1,
});

export const MIN_BOT_STRATEGY_WEIGHT = 0.25;
export const MAX_BOT_STRATEGY_WEIGHT = 2;

export function parseBotStrategyWeightMap(value: unknown): BotStrategyWeightMap | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

    const weights: BotStrategyWeightMap = {};
    for (const [profile, rawWeights] of Object.entries(value)) {
        if (!BOT_PROFILES.includes(profile as BotProfile)) return null;
        if (typeof rawWeights !== "object" || rawWeights === null || Array.isArray(rawWeights)) {
            return null;
        }

        const record = rawWeights as Record<string, unknown>;
        if (
            Object.keys(record).some(
                (key) => !BOT_STRATEGY_WEIGHT_KEYS.some((weightKey) => weightKey === key),
            )
        ) {
            return null;
        }
        const profileWeights = { ...DEFAULT_BOT_STRATEGY_WEIGHTS };
        for (const key of BOT_STRATEGY_WEIGHT_KEYS) {
            const weight = record[key];
            if (weight === undefined) continue;
            if (
                typeof weight !== "number" ||
                !Number.isFinite(weight) ||
                weight < MIN_BOT_STRATEGY_WEIGHT ||
                weight > MAX_BOT_STRATEGY_WEIGHT
            ) {
                return null;
            }
            profileWeights[key] = weight;
        }
        weights[profile as BotProfile] = profileWeights;
    }
    return weights;
}

export const BOT_PROFILE_LABELS: Record<BotProfile, string> = {
    balanced: "Polyvalent — adaptatif",
    cheap: "Monstres peu chers — adaptatif",
    expensive: "Monstres coûteux — adaptatif",
    offensive: "Offensif — victoire aux PV",
    support: "Soutien — adaptatif",
    defensive: "Défensif — périmètre",
    tracker: "Traqueur — élimination des monstres",
    random: "Aléatoire — actions et deck",
    "random-deck": "Deck aléatoire — stratégie équilibrée",
    "random-strategy": "Stratégie aléatoire — deck de référence",
    greedy: "Glouton — valeur immédiate",
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
    if (profile === "random" || profile === "random-strategy") {
        return { tactic: "balanced", description: "choisit aléatoirement des actions légales" };
    }
    if (profile === "random-deck") {
        return { tactic: "balanced", description: "utilise la stratégie équilibrée avec un deck aléatoire" };
    }
    if (profile === "greedy") {
        return { tactic: "offense", description: "maximise la valeur immédiate sans recherche future" };
    }
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

export function scoreMonsterForProfile(
    monster: Monster,
    profile: BotProfile,
    weights: Readonly<BotStrategyWeights> = DEFAULT_BOT_STRATEGY_WEIGHTS,
): number {
    switch (profile) {
        case "cheap":
            return -monster.cost * weights.monsterCost;
        case "expensive":
            return monster.cost * weights.monsterCost;
        case "offensive":
            return (
                offenseValue(monster) * 4 * weights.monsterOffense +
                monster.hp * 0.1 * weights.monsterDurability -
                monster.cost * 0.15 * weights.monsterCost
            );
        case "support":
            return (
                supportValue(monster) * 10 * weights.monsterSupport +
                offenseValue(monster) * 0.1 * weights.monsterOffense -
                monster.cost * 0.1 * weights.monsterCost
            );
        case "defensive":
            return (
                offenseValue(monster) * 2 * weights.monsterOffense +
                monster.hp * 0.6 * weights.monsterDurability -
                monster.cost * 0.1 * weights.monsterCost
            );
        case "tracker":
            return (
                offenseValue(monster) * 4 * weights.monsterOffense +
                monster.hp * 0.1 * weights.monsterDurability -
                monster.cost * 0.15 * weights.monsterCost
            );
        case "balanced":
            return (
                5 -
                Math.abs(monster.cost - 4) * weights.monsterCost +
                monster.hp * 0.1 * weights.monsterDurability
            );
        case "random":
            return 0;
        case "random-deck":
            return (
                5 -
                Math.abs(monster.cost - 4) * weights.monsterCost +
                monster.hp * 0.1 * weights.monsterDurability
            );
        case "random-strategy":
            return (
                5 -
                Math.abs(monster.cost - 4) * weights.monsterCost +
                monster.hp * 0.1 * weights.monsterDurability
            );
        case "greedy":
            return offenseValue(monster) * 2 * weights.monsterOffense - monster.cost * 0.1;
    }
}

export function chooseDeck(
    monsters: readonly Monster[],
    profile: BotProfile,
    deckSize: number,
    random: () => number = Math.random,
    weights: Readonly<BotStrategyWeights> = DEFAULT_BOT_STRATEGY_WEIGHTS,
): string[] {
    if (
        profile === "random" ||
        profile === "random-deck" ||
        profile === "random-strategy"
    ) {
        const deck: string[] = [];
        const remaining = [...monsters];
        while (deck.length < deckSize && remaining.length > 0) {
            const index = Math.min(
                remaining.length - 1,
                Math.floor(Math.max(0, Math.min(1 - Number.EPSILON, random())) * remaining.length),
            );
            deck.push(remaining[index]!.id);
            remaining.splice(index, 1);
        }
        return deck;
    }
    const remaining = [...monsters].sort(
        (first, second) =>
            scoreMonsterForProfile(second, profile, weights) -
                scoreMonsterForProfile(first, profile, weights) ||
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
        const candidates = preferredCandidates.length > 0 ? preferredCandidates : remaining;
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
        case "random":
            return `profil random : choix aléatoire, coût ${monster.cost}`;
        case "random-deck":
            return `profil random-deck : deck aléatoire, stratégie équilibrée`;
        case "random-strategy":
            return `profil random-strategy : stratégie aléatoire, deck de référence`;
        case "greedy":
            return `profil greedy : valeur immédiate, coût ${monster.cost}`;
    }
}

export function scoreTerritoryExpansion(
    player: PlayerId,
    candidateCells: readonly Position[],
    ownedCells: readonly Position[],
    startingPosition: Position,
    enemyStartingPosition: Position,
): number {
    return createTerritoryExpansionScorer(
        player,
        ownedCells,
        startingPosition,
        enemyStartingPosition,
    )(candidateCells);
}

export function createTerritoryExpansionScorer(
    player: PlayerId,
    ownedCells: readonly Position[],
    startingPosition: Position,
    enemyStartingPosition: Position,
): (candidateCells: readonly Position[]) => number {
    const ownedKeys = new Set([startingPosition, ...ownedCells].map(({ x, y }) => `${x},${y}`));
    let currentDistance = getGridDistance(startingPosition, enemyStartingPosition);
    let currentFrontier = startingPosition.x;
    for (const cell of ownedCells) {
        currentDistance = Math.min(currentDistance, getGridDistance(cell, enemyStartingPosition));
        currentFrontier =
            player === 1 ? Math.max(currentFrontier, cell.x) : Math.min(currentFrontier, cell.x);
    }

    return (candidateCells) => {
        let nextDistance = Number.POSITIVE_INFINITY;
        let nextFrontier = player === 1 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
        let newCells = 0;
        let reusedCells = 0;
        for (const cell of candidateCells) {
            if (ownedKeys.has(`${cell.x},${cell.y}`)) {
                reusedCells++;
            } else {
                newCells++;
                nextDistance = Math.min(nextDistance, getGridDistance(cell, enemyStartingPosition));
                nextFrontier =
                    player === 1 ? Math.max(nextFrontier, cell.x) : Math.min(nextFrontier, cell.x);
            }
        }
        if (newCells === 0) {
            return reusedCells * 25;
        }

        const objectiveProgress = currentDistance - nextDistance;
        const forwardProgress =
            player === 1 ? nextFrontier - currentFrontier : currentFrontier - nextFrontier;
        return objectiveProgress * 100 + forwardProgress * 5 + newCells + reusedCells * 10;
    };
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

export function createPathBlockadeScorer(
    boardWidth: number,
    boardHeight: number,
    ownBase: Position,
    enemyBase: Position,
    ownPathCells: readonly Position[],
    blockedCells: readonly Position[],
    weights: Readonly<BotStrategyWeights> = DEFAULT_BOT_STRATEGY_WEIGHTS,
): (candidateCells: readonly Position[]) => number {
    const board = {
        id: "route-analysis",
        width: boardWidth,
        height: boardHeight,
        blockedCells: [],
    };
    const fixedBlocks = [...ownPathCells, ...blockedCells];
    const current = analyzePotentialRoutes(board, enemyBase, ownBase, {
        blockedCells: fixedBlocks,
    });
    if (current.shortestDistance === null) return () => 0;

    const relevantCells = new Set(
        current.nearOptimalCells.map(({ x, y }) => `${x},${y}`),
    );
    const criticalCells = new Set(
        current.criticalCells.map(({ x, y }) => `${x},${y}`),
    );
    const fixedCellKeys = new Set(fixedBlocks.map(({ x, y }) => `${x},${y}`));
    const protectedCellKeys = new Set([
        `${ownBase.x},${ownBase.y}`,
        `${enemyBase.x},${enemyBase.y}`,
    ]);

    return (candidateCells) => {
        const validCandidates = [
            ...new Map(
                candidateCells
                    .filter(
                        ({ x, y }) =>
                            x >= 0 &&
                            y >= 0 &&
                            x < boardWidth &&
                            y < boardHeight &&
                            !fixedCellKeys.has(`${x},${y}`) &&
                            !protectedCellKeys.has(`${x},${y}`),
                    )
                    .map((cell) => [`${cell.x},${cell.y}`, cell] as const),
            ).values(),
        ];
        if (
            validCandidates.length === 0 ||
            !validCandidates.some(({ x, y }) => relevantCells.has(`${x},${y}`))
        ) {
            return 0;
        }

        const candidateKeys = new Set(
            validCandidates.map(({ x, y }) => `${x},${y}`),
        );
        const criticalHits = validCandidates.filter(({ x, y }) =>
            criticalCells.has(`${x},${y}`),
        ).length;
        const distanceAfterBlockade =
            criticalHits > 0
                ? getShortestRouteDistance(
                      board,
                      enemyBase,
                      ownBase,
                      [...fixedBlocks, ...validCandidates],
                  )
                : current.shortestDistance;
        if (distanceAfterBlockade === null) {
            return Math.min(500, 500 * weights.routeDenial);
        }
        const costIncrease = Math.max(
            0,
            distanceAfterBlockade - current.shortestDistance,
        );
        const lostRouteArea =
            validCandidates.filter(({ x, y }) => relevantCells.has(`${x},${y}`)).length /
            Math.max(1, current.nearOptimalCellCount);
        const lostAlternatives =
            current.alternativeRoutes.filter((route) =>
                route.cells.some(({ x, y }) => candidateKeys.has(`${x},${y}`)),
            ).length / Math.max(1, current.alternativeRoutes.length);
        const chokepointRatio =
            criticalHits / Math.max(1, current.criticalCells.length);

        return Math.min(
            500,
            costIncrease * 80 * weights.routeDenial +
                (lostRouteArea + lostAlternatives) * 40 * weights.routeRedundancy +
                chokepointRatio * 40 * weights.chokepointControl,
        );
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
    weights: Readonly<BotStrategyWeights> = DEFAULT_BOT_STRATEGY_WEIGHTS,
): number {
    if (value.baseDamage > 0 && value.baseDamage >= enemyBaseHealth) {
        return Number.MAX_SAFE_INTEGER;
    }

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
        value.baseDamage * baseUrgency * basePreference * weights.baseDamage +
        value.damage * damagePreference * weights.damage +
        value.statusDamage * 1.5 * weights.statusDamage +
        value.kills * killPreference * weights.kills +
        supportValue * supportPreference * weights.support -
        value.friendlyDamage * 4 * weights.friendlyDamage;
    const effectiveProfile =
        profile ?? (tactic === "cheap" || tactic === "expensive" ? tactic : undefined);
    const costBias =
        effectiveProfile === "cheap" ? 1.5 : effectiveProfile === "expensive" ? 0.25 : 0.5;

    return Math.max(0, score) / (Math.max(0, cost) + costBias * weights.costEfficiency);
}

export function findObjectiveMovement(
    options: MovementOptions,
    ownedCells: readonly Position[],
    objective: Position,
    enemyPositions: readonly Position[] = [],
    tactic: BotTactic = "balanced",
    threatScores: ReadonlyMap<string, number> = new Map(),
    weights: Readonly<BotStrategyWeights> = DEFAULT_BOT_STRATEGY_WEIGHTS,
): ObjectiveMovement | null {
    const getKey = ({ x, y }: Position): string => `${x},${y}`;
    const occupied = new Set(options.occupiedCells.map(getKey));
    const blocked = new Set(options.blockedCells.map(getKey));
    const hostile = new Set((options.hostileCells ?? []).map(getKey));
    const goalCells = [...new Map(ownedCells.map((cell) => [getKey(cell), cell])).values()]
        .filter(
            (cell) =>
                getKey(cell) !== getKey(options.source) &&
                !occupied.has(getKey(cell)) &&
                !blocked.has(getKey(cell)) &&
                (options.canPassHostiles || !hostile.has(getKey(cell))),
        )
        .sort(
            (first, second) =>
                getGridDistance(first, objective) - getGridDistance(second, objective),
        );
    const distances = getMovementDistanceMap(
        goalCells.length > 0 ? goalCells : [options.source],
        options,
    );
    const { paths } = analyzeLegalMovementRoutes(options);
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
            (tactic === "hunt" || tactic === "defense") && enemyPositions.length
                ? Math.min(
                      ...enemyPositions.map((enemy) => getGridDistance(options.source, enemy)),
                  ) -
                  Math.min(...enemyPositions.map((enemy) => getGridDistance(destination, enemy)))
                : 0;
        const allies =
            tactic === "defense"
                ? options.occupiedCells.filter((cell) => !hostile.has(getKey(cell)))
                : [];
        const currentAllyDistance = allies.length
            ? Math.min(...allies.map((ally) => getGridDistance(options.source, ally)))
            : 0;
        const destinationAllyDistance = allies.length
            ? Math.min(...allies.map((ally) => getGridDistance(destination, ally)))
            : 0;
        const cohesionProgress = currentAllyDistance - destinationAllyDistance;
        if (
            routeProgress <= 0 &&
            objectiveProgress <= 0 &&
            enemyProgress <= 0 &&
            cohesionProgress <= 0
        ) {
            continue;
        }

        const path = paths.get(getKey(destination)) ?? [];
        if (path.length < 2) continue;

        const threat = threatScores.get(getKey(destination)) ?? 0;
        const score =
            objectiveProgress * 100 * weights.movementObjective +
            enemyProgress *
                (tactic === "hunt" ? 60 * weights.movementHunt : 12 * weights.interception) +
            routeProgress * 10 * weights.movementRoute -
            (tactic === "defense"
                ? Math.max(0, routeProgress) * 10 * weights.defensiveCoverage
                : 0) +
            cohesionProgress * 4 * weights.formationCohesion -
            threat * 20 * weights.movementThreat;
        if (score <= bestScore) continue;
        bestScore = score;
        best = { position: destination, path, routeProgress };
    }
    return best;
}
