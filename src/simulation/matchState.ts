import { PLACEMENT_PATTERNS } from "../data/placementPatterns";
import { getInitialAttackCooldowns, getInitialAttackUses } from "../game/monsterActions";
import type { GameConfiguration } from "../game/gameConfiguration";
import { getStartingPositions, type BoardDefinition } from "../game/boards";
import { getInvokedMonsterCount } from "../game/matchRules";
import {
    createInitialDeploymentProtection,
    findValidPlacement,
    findValidPlacements,
    hasValidPlacement,
    type PlacementSearchOptions,
} from "../game/placement";
import type { Monster, PlayerId, PlacedMonster, Position } from "../types/GameTypes";
import {
    canDeployMonsterForProfile,
    chooseBotObjective,
    createTerritoryExpansionScorer,
    createDefensivePlacementScorer,
    createPathBlockadeScorer,
    describeDeploymentChoice,
    scoreMonsterForProfile,
    type BotTactic,
    type BotStrategyWeights,
    DEFAULT_BOT_STRATEGY_WEIGHTS,
} from "../game/botStrategy";
import { getMonsterSymbol } from "../game/monsterSymbols";
import type {
    BotProfile,
    FinalBoard,
    MatchResult,
    PlayerSimulationStats,
    SimulationEvent,
    TacticalDecisionTrace,
} from "./types";
import {
    createStrategicCellScorer,
    evaluateStrategicState,
    type StrategicSnapshot,
} from "../game/ai";

export interface MatchState {
    turn: number;
    currentPlayer: PlayerId;
    debug?: boolean;
    protectFirstDeployment?: boolean;
    completeAttackPhases?: boolean;
    broaderAttackCandidates?: boolean;
    movementAttackCombos?: boolean;
    summonPlacementPairs?: boolean;
    nextTurnDice?: {
        count: number;
        removeInvocationDiceWhenNoMonsters: boolean;
        maxMonstersPerPlayer: number;
    };
    strategyWeights?: Record<PlayerId, Readonly<BotStrategyWeights>>;
    decisionTraces?: TacticalDecisionTrace[];
    profiles: Record<PlayerId, BotProfile>;
    tactics: Record<PlayerId, BotTactic>;
    allowBaseAttackOnSummonTurn: boolean;
    winner: PlayerId | null;
    finishReason: MatchResult["finishReason"];
    health: Record<PlayerId, number>;
    reserves: Record<PlayerId, { invocation: number; attack: number; movement: number }>;
    monsters: PlacedMonster[];
    movementStagnation: Record<string, number>;
    placementProtectionCache?: {
        key: string;
        preservesFirstDeployment: (cells: readonly Position[]) => boolean;
    };
    history: SimulationEvent[];
    statistics: Record<PlayerId, PlayerSimulationStats>;
    nextMonsterId: number;
    monstersKilledForVictory: number;
    actionRandom?: Record<PlayerId, () => number>;
}

const SUMMON_PAIR_PLACEMENT_CANDIDATES = 3;

export function createStats(): PlayerSimulationStats {
    return {
        summoned: 0,
        summonedByMonster: {},
        attacks: 0,
        damageDealt: 0,
        monstersKilled: 0,
        monstersLost: 0,
        damageReceived: 0,
        baseDamage: 0,
        movements: 0,
        symbolsSpent: { invocation: 0, attack: 0, movement: 0 },
        conversionLosses: 0,
        turnsWithoutSummon: 0,
        turnsWithoutAttack: 0,
        turnsWithoutMovement: 0,
        turnsWithoutUsefulAction: 0,
        noLegalPlacementTurns: 0,
        stagnantMonsterTurns: 0,
        blockedInvocationAttempts: 0,
        unreachableObjectives: 0,
        actionsSkippedByReason: {},
        lastMonsterSummonTurn: null,
        ineffectiveActions: 0,
        decisionsWithoutImpact: 0,
        decisionTimeMs: 0,
        positionsExplored: 0,
        branchesExplored: 0,
        maxSearchDepthReached: 0,
        searchDecisions: 0,
        decisionsChangedBySearch: 0,
        searchNodes: 0,
        nodesBeyondFirstThree: 0,
    };
}

export function addEvent(state: MatchState, event: SimulationEvent): void {
    state.history.push(event);
}

export function opposingPlayer(player: PlayerId): PlayerId {
    return player === 1 ? 2 : 1;
}

export function getPlayerMonsters(state: MatchState, player: PlayerId): PlacedMonster[] {
    return state.monsters.filter((monster) => monster.owner === player && monster.currentHp > 0);
}

export function buildMatchBoard(
    board: BoardDefinition,
    state: MatchState,
    monsterSymbols: ReadonlyMap<string, string>,
    monsterDefinitions: readonly { id: string; name: string }[],
): FinalBoard {
    const starts = getStartingPositions(board);
    const livingMonstersByPosition = new Map<string, PlacedMonster>();
    const territoryOwnerByCell = new Map<string, PlayerId>();
    for (const monster of state.monsters) {
        for (const cell of monster.cells) {
            const key = `${cell.x},${cell.y}`;
            if (!territoryOwnerByCell.has(key)) territoryOwnerByCell.set(key, monster.owner);
        }
        if (monster.currentHp > 0) {
            const key = `${monster.position.x},${monster.position.y}`;
            if (!livingMonstersByPosition.has(key)) livingMonstersByPosition.set(key, monster);
        }
    }
    const blockedCells = new Set(board.blockedCells.map(({ x, y }) => `${x},${y}`));
    const rows = Array.from({ length: board.height }, (_, y) =>
        Array.from({ length: board.width }, (_, x) => {
            const key = `${x},${y}`;
            const placed = livingMonstersByPosition.get(key);
            if (placed) return getMonsterSymbol(monsterSymbols, placed.monster.id);
            if (blockedCells.has(key)) return "#";
            if (starts[1].x === x && starts[1].y === y) return "1";
            if (starts[2].x === x && starts[2].y === y) return "2";
            const territoryOwner = territoryOwnerByCell.get(key);
            return territoryOwner === 1 ? "a" : territoryOwner === 2 ? "b" : ".";
        }).join(""),
    );
    return {
        width: board.width,
        height: board.height,
        rows,
        legend: [
            { symbol: ".", meaning: "Case libre" },
            { symbol: "#", meaning: "Case bloquée" },
            { symbol: "1", meaning: "Départ joueur 1" },
            { symbol: "2", meaning: "Départ joueur 2" },
            { symbol: "a", meaning: "Territoire déployé joueur 1" },
            { symbol: "b", meaning: "Territoire déployé joueur 2" },
            ...monsterDefinitions.map((monster) => ({
                symbol: getMonsterSymbol(monsterSymbols, monster.id),
                meaning: monster.name,
            })),
        ],
    };
}

interface PlacementSearchContext {
    starts: Record<PlayerId, Position>;
    ownCells: Position[];
    enemyPositions: Position[];
    options: Omit<PlacementSearchOptions, "scorePlacement">;
}

function createPlacementSearchContext(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
): PlacementSearchContext {
    const starts = getStartingPositions(board);
    const occupiedCells = [...Object.values(starts), ...state.monsters.flatMap((m) => m.cells)];
    const ownCells = state.monsters
        .filter((monster) => monster.owner === player)
        .flatMap((monster) => monster.cells);
    const opponentCells = state.monsters
        .filter((monster) => monster.owner !== player)
        .flatMap((monster) => monster.cells);
    const enemyPositions = state.monsters
        .filter((monster) => monster.owner !== player && monster.currentHp > 0)
        .map((monster) => monster.position);
    const enemyKeys = new Set(
        [starts[opposingPlayer(player)], ...opponentCells].map(({ x, y }) => `${x},${y}`),
    );
    const livingMonsterKeys = new Set(
        state.monsters
            .filter((monster) => monster.currentHp > 0)
            .map(({ position }) => `${position.x},${position.y}`),
    );
    const baseOptions: Omit<PlacementSearchOptions, "scorePlacement"> = {
        patterns: PLACEMENT_PATTERNS,
        boardWidth: board.width,
        boardHeight: board.height,
        start: starts[player],
        occupiedCells,
        connectedCells: [starts[player], ...ownCells],
        overlappingCells: ownCells,
        blockedCells: board.blockedCells,
        isPlacementAllowed: (position, cells) => {
            const key = `${position.x},${position.y}`;
            return (
                !enemyKeys.has(key) &&
                !livingMonsterKeys.has(key) &&
                !cells.some((cell) => enemyKeys.has(`${cell.x},${cell.y}`))
            );
        },
    };
    const opponent = opposingPlayer(player);
    let isPlacementAllowed = baseOptions.isPlacementAllowed;
    if (
        state.protectFirstDeployment !== false &&
        getInvokedMonsterCount(state.monsters, opponent) === 0
    ) {
        const placementKey = [
            board.width,
            board.height,
            opponent,
            ...board.blockedCells.map(({ x, y }) => `${x},${y}`).sort(),
            "|",
            ...occupiedCells.map(({ x, y }) => `${x},${y}`).sort(),
        ].join(";");
        if (state.placementProtectionCache?.key !== placementKey) {
            const preservesFirstDeployment = createInitialDeploymentProtection({
                patterns: PLACEMENT_PATTERNS,
                boardWidth: board.width,
                boardHeight: board.height,
                start: starts[opponent],
                occupiedCells,
                connectedCells: [starts[opponent]],
                blockedCells: board.blockedCells,
            });
            if (preservesFirstDeployment) {
                state.placementProtectionCache = {
                    key: placementKey,
                    preservesFirstDeployment,
                };
            } else {
                delete state.placementProtectionCache;
            }
        }
        const preservesFirstDeployment = state.placementProtectionCache?.preservesFirstDeployment;
        if (preservesFirstDeployment) {
            isPlacementAllowed = (position, cells) =>
                (baseOptions.isPlacementAllowed?.(position, cells) ?? true) &&
                preservesFirstDeployment(cells);
        }
    }

    return {
        starts,
        ownCells,
        enemyPositions,
        options: { ...baseOptions, isPlacementAllowed },
    };
}

function createStrategicSnapshot(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
): StrategicSnapshot {
    return {
        board,
        health: { ...state.health },
        initialHealth: Math.max(state.health[1], state.health[2], 1),
        monsters: state.monsters,
        reserves: {
            1: { ...state.reserves[1] },
            2: { ...state.reserves[2] },
        },
        profile: state.profiles[player],
        tactics: { ...state.tactics },
        currentPlayer: player,
        turn: state.turn,
    };
}

function createSummonedMonsterCandidate(
    state: MatchState,
    player: PlayerId,
    monster: Monster,
    placement: { position: Position; cells: readonly Position[] },
): PlacedMonster {
    return {
        id: `m${state.nextMonsterId}`,
        monster,
        owner: player,
        position: placement.position,
        facing: player === 1 ? "east" : "west",
        currentHp: monster.hp,
        cells: [...placement.cells],
        summonedOnTurn: state.turn,
        attacksUsedThisTurn: 0,
        attackUsesThisTurn: getInitialAttackUses(monster),
        movementsUsedThisTurn: 0,
        attackCooldowns: getInitialAttackCooldowns(monster),
        statusEffects: [],
        isCamouflaged: false,
    };
}

function evaluateSummonPlacement(
    state: MatchState,
    player: PlayerId,
    monster: Monster,
    placement: { position: Position; cells: readonly Position[] },
    snapshot: StrategicSnapshot,
): number {
    const reserves = {
        1: { ...state.reserves[1] },
        2: { ...state.reserves[2] },
    };
    reserves[player].invocation -= monster.cost;
    return evaluateStrategicState({
        ...snapshot,
        monsters: [
            ...state.monsters,
            createSummonedMonsterCandidate(state, player, monster, placement),
        ],
        reserves,
    });
}

function findPlacement(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
): { position: Position; cells: Position[] } | null {
    const context = createPlacementSearchContext(state, board, player);
    const scorePlacement = createPlacementScorer(state, board, player, context);
    const { options } = context;
    return findValidPlacement({ ...options, scorePlacement });
}

function createPlacementScorer(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
    context: ReturnType<typeof createPlacementSearchContext> = createPlacementSearchContext(
        state,
        board,
        player,
    ),
): NonNullable<PlacementSearchOptions["scorePlacement"]> {
    const { starts, ownCells, enemyPositions } = context;
    const opponent = opposingPlayer(player);
    const expansionObjective = chooseBotObjective(
        state.tactics[player],
        starts[player],
        starts[opponent],
        enemyPositions,
        starts[player],
    );
    const territoryExpansionScore = createTerritoryExpansionScorer(
        player,
        ownCells,
        starts[player],
        expansionObjective,
    );
    const blockingCells = [
        ...board.blockedCells,
        ...state.monsters
            .filter((monster) => monster.currentHp > 0)
            .map((monster) => monster.position),
    ];
    const defensivePlacementScore = createDefensivePlacementScorer(
        starts[player],
        enemyPositions,
        blockingCells,
    );
    const weights = state.strategyWeights?.[player] ?? DEFAULT_BOT_STRATEGY_WEIGHTS;
    const pathBlockadeScore =
        state.tactics[player] === "defense" || state.tactics[player] === "hunt"
            ? createPathBlockadeScorer(
                  board.width,
                  board.height,
                  starts[player],
                  starts[opponent],
                  ownCells,
                  board.blockedCells,
                  weights,
              )
            : () => 0;
    const snapshot = createStrategicSnapshot(state, board, player);
    const strategicCellScore = createStrategicCellScorer(snapshot, player);
    return (position, cells) =>
        territoryExpansionScore(cells) * weights.territoryExpansion +
        (state.tactics[player] === "defense" || state.tactics[player] === "hunt"
            ? defensivePlacementScore(position) * weights.defensivePlacement
            : 0) +
        pathBlockadeScore(cells) * weights.pathBlockade +
        strategicCellScore(position) * 0.5 * weights.strategicPlacement;
}

function findBestSummonPlacementPair(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
    monsters: readonly Monster[],
): { monster: Monster; placement: { position: Position; cells: Position[] } } | null {
    const context = createPlacementSearchContext(state, board, player);
    const scorePlacement = createPlacementScorer(state, board, player, context);
    const { options } = context;
    const placements = findValidPlacements(options)
        .map((placement) => ({
            ...placement,
            score: scorePlacement(placement.position, placement.cells),
        }))
        .sort(
            (first, second) =>
                second.score - first.score ||
                first.position.y - second.position.y ||
                first.position.x - second.position.x,
        )
        .slice(0, SUMMON_PAIR_PLACEMENT_CANDIDATES);
    if (placements.length === 0) return null;

    const snapshot = createStrategicSnapshot(state, board, player);
    let bestPair: {
        monster: Monster;
        placement: { position: Position; cells: Position[] };
    } | null = null;
    let bestStrategicScore = Number.NEGATIVE_INFINITY;
    for (const monster of monsters) {
        for (const placement of placements) {
            const score = evaluateSummonPlacement(state, player, monster, placement, snapshot);
            if (score <= bestStrategicScore) continue;
            bestStrategicScore = score;
            bestPair = { monster, placement };
        }
    }
    return bestPair;
}

export function hasAvailablePlacement(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
): boolean {
    const { options } = createPlacementSearchContext(state, board, player);
    return hasValidPlacement(options);
}

export function canSpend(
    state: MatchState,
    player: PlayerId,
    symbol: keyof MatchState["reserves"][1],
    cost: number,
): boolean {
    return state.reserves[player][symbol] >= cost;
}

export function spend(
    state: MatchState,
    player: PlayerId,
    symbol: keyof MatchState["reserves"][1],
    cost: number,
): boolean {
    if (!canSpend(state, player, symbol, cost)) return false;
    state.reserves[player][symbol] -= cost;
    state.statistics[player].symbolsSpent[symbol] += cost;
    return true;
}

export function deployMonsters(
    state: MatchState,
    configuration: GameConfiguration,
    board: BoardDefinition,
    profile: BotProfile,
    deckMonsters: readonly Monster[],
): void {
    const weights = state.strategyWeights?.[state.currentPlayer] ?? DEFAULT_BOT_STRATEGY_WEIGHTS;
    const profileScores = new Map(
        deckMonsters.map((monster) => [
            monster.id,
            scoreMonsterForProfile(monster, profile, weights),
        ]),
    );

    while (
        getInvokedMonsterCount(state.monsters, state.currentPlayer) <
            configuration.maxMonstersPerPlayer &&
        state.winner === null
    ) {
        const placement = state.summonPlacementPairs
            ? null
            : findPlacement(state, board, state.currentPlayer);
        if (!state.summonPlacementPairs && !placement) return;
        const summonedByMonster = state.statistics[state.currentPlayer].summonedByMonster;
        const deployedCosts = state.monsters
            .filter((monster) => monster.owner === state.currentPlayer)
            .map((monster) => monster.monster.cost);
        const affordableMonsters = deckMonsters.filter((monster) =>
            canSpend(state, state.currentPlayer, "invocation", monster.cost),
        );
        const preferredMonsters = affordableMonsters.filter((monster) =>
            canDeployMonsterForProfile(monster, profile, deployedCosts),
        );
        const strategicChoices = (
            preferredMonsters.length > 0 ? preferredMonsters : affordableMonsters
        ).sort((first, second) => {
            const firstCount = summonedByMonster[first.id] ?? 0;
            const secondCount = summonedByMonster[second.id] ?? 0;
            const firstSupport = first.attacks.filter((attack) => attack.targetsAlliesOnly).length;
            const secondSupport = second.attacks.filter(
                (attack) => attack.targetsAlliesOnly,
            ).length;
            const swarmPenalty = profile === "cheap" ? 3 : 2;
            const diversityPenalty =
                (firstSupport === 0 ? 0 : firstSupport * 4) +
                firstCount * swarmPenalty -
                ((secondSupport === 0 ? 0 : secondSupport * 4) + secondCount * swarmPenalty);
            return (
                -diversityPenalty ||
                firstCount - secondCount ||
                (profileScores.get(second.id) ?? 0) - (profileScores.get(first.id) ?? 0) ||
                first.cost - second.cost
            );
        });
        const choices =
            profile === "random" || profile === "random-strategy"
                ? (() => {
                      const shuffled = [...strategicChoices];
                      const random = state.actionRandom?.[state.currentPlayer];
                      for (let index = shuffled.length - 1; index > 0; index--) {
                          const swapIndex = Math.floor(
                              Math.max(0, Math.min(1 - Number.EPSILON, random?.() ?? 0.5)) *
                                  (index + 1),
                          );
                          [shuffled[index], shuffled[swapIndex]] = [
                              shuffled[swapIndex]!,
                              shuffled[index]!,
                          ];
                      }
                      return shuffled;
                  })()
                : strategicChoices;
        let monster = choices[0];
        let selectedPlacement = placement;
        if (state.summonPlacementPairs && monster) {
            const bestPair = findBestSummonPlacementPair(
                state,
                board,
                state.currentPlayer,
                choices,
            );
            if (!bestPair) return;
            monster = bestPair.monster;
            selectedPlacement = bestPair.placement;
        }
        if (
            !monster ||
            !selectedPlacement ||
            !spend(state, state.currentPlayer, "invocation", monster.cost)
        )
            return;

        const placed = createSummonedMonsterCandidate(
            state,
            state.currentPlayer,
            monster,
            selectedPlacement,
        );
        state.nextMonsterId++;
        state.monsters.push(placed);
        const stats = state.statistics[state.currentPlayer];
        stats.summoned++;
        if (
            stats.summoned >= configuration.maxMonstersPerPlayer &&
            stats.lastMonsterSummonTurn === null
        ) {
            stats.lastMonsterSummonTurn = state.turn;
        }
        stats.summonedByMonster[monster.id] = (stats.summonedByMonster[monster.id] ?? 0) + 1;
        addEvent(state, {
            turn: state.turn,
            player: state.currentPlayer,
            type: "strategy",
            description: describeDeploymentChoice(monster, profile),
            monsterId: placed.id,
            monsterName: monster.name,
            ...(state.debug
                ? {
                      debug: {
                          situation: `invoquer J${state.currentPlayer}, réservation=${state.reserves[state.currentPlayer].invocation}`,
                          candidates: choices.length,
                          depth: 1,
                          positionsExplored: state.monsters.length,
                          selectedAction: monster.name,
                      },
                  }
                : {}),
        });
        addEvent(state, {
            turn: state.turn,
            player: state.currentPlayer,
            type: "invocation",
            description: `${monster.name} invoqué pour ${monster.cost} symbole(s).`,
            monsterId: placed.id,
            monsterTypeId: monster.id,
            monsterName: monster.name,
            cost: monster.cost,
            to: selectedPlacement.position,
        });
    }
}
