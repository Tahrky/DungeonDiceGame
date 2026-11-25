import { PLACEMENT_PATTERNS } from "../data/placementPatterns";
import { createPlacedMonster } from "../game/monsterActions";
import { getStartingPositions, type BoardDefinition } from "../game/boards";
import { getGridDistance, positionKey } from "../game/geometry";
import { byPlayer, getInvokedMonsterCount, opposingPlayer } from "../game/matchRules";
import {
    createInitialDeploymentProtection,
    findValidPlacement,
    findValidPlacements,
    hasValidPlacement,
    type PatternPlacement,
    type PlacementSearchOptions,
} from "../game/placement";
import type { Monster, PlayerId, PlacedMonster, Position } from "../types/GameTypes";
import {
    chooseBotObjective,
    createTerritoryExpansionScorer,
    createDefensivePlacementScorer,
    createPathBlockadeScorer,
    DEFAULT_BOT_STRATEGY_WEIGHTS,
    type BotTactic,
} from "../game/botStrategy";
import { createStrategicSnapshot, getBlockedCells, type MatchState } from "./matchState";
import { createFormationScorer } from "../game/formation";
import { getPlacementReplyPenalty } from "./placementReply";
import {
    createStrategicCellScorer,
    evaluateStrategicState,
    type StrategicSnapshot,
} from "../game/ai";

const SUMMON_PAIR_PLACEMENT_CANDIDATES = 3;

export interface SummonChoice {
    readonly monster: Monster;
    readonly placement: PatternPlacement;
}

type SummonSearchOptions = Omit<PlacementSearchOptions, "scorePlacement">;

interface SummonSearchContext {
    starts: Record<PlayerId, Position>;
    ownCells: Position[];
    enemyPositions: Position[];
    options: SummonSearchOptions;
}

function getFirstDeploymentProtection(
    state: MatchState,
    board: BoardDefinition,
    opponent: PlayerId,
    opponentStart: Position,
    occupiedCells: Position[],
): SummonSearchOptions["isFootprintAllowed"] {
    if (
        state.protectFirstDeployment === false ||
        getInvokedMonsterCount(state.monsters, opponent) !== 0
    ) {
        return undefined;
    }
    const blockedCells = getBlockedCells(state, board);
    const placementKey = [
        board.width,
        board.height,
        opponent,
        ...blockedCells.map(positionKey).sort(),
        "|",
        ...occupiedCells.map(positionKey).sort(),
    ].join(";");
    if (state.placementProtectionCache?.key !== placementKey) {
        const preservesFirstDeployment = createInitialDeploymentProtection({
            patterns: PLACEMENT_PATTERNS,
            boardWidth: board.width,
            boardHeight: board.height,
            start: opponentStart,
            occupiedCells,
            connectedCells: [opponentStart],
            blockedCells,
        });
        if (preservesFirstDeployment) {
            state.placementProtectionCache = { key: placementKey, preservesFirstDeployment };
        } else {
            delete state.placementProtectionCache;
        }
    }
    return state.placementProtectionCache?.preservesFirstDeployment;
}

function createSummonSearchContext(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
): SummonSearchContext {
    const starts = getStartingPositions(board);
    const blockedCells = getBlockedCells(state, board);
    const opponent = opposingPlayer(player);
    const occupiedCells = [...Object.values(starts), ...state.monsters.flatMap((m) => m.cells)];
    const ownCells = state.monsters
        .filter((monster) => monster.owner === player)
        .flatMap((monster) => monster.cells);
    const enemyPositions = state.monsters
        .filter((monster) => monster.owner !== player && monster.currentHp > 0)
        .map((monster) => monster.position);
    const livingMonsterKeys = new Set(
        state.monsters
            .filter((monster) => monster.currentHp > 0)
            .map(({ position }) => positionKey(position)),
    );
    return {
        starts,
        ownCells,
        enemyPositions,
        options: {
            patterns: PLACEMENT_PATTERNS,
            boardWidth: board.width,
            boardHeight: board.height,
            start: starts[player],
            occupiedCells,
            connectedCells: [starts[player], ...ownCells],
            overlappingCells: ownCells,
            blockedCells,
            isPlacementAllowed: (position) => !livingMonsterKeys.has(positionKey(position)),
            isFootprintAllowed: getFirstDeploymentProtection(
                state,
                board,
                opponent,
                starts[opponent],
                occupiedCells,
            ),
        },
    };
}

export function createSummonedMonsterCandidate(
    state: MatchState,
    player: PlayerId,
    monster: Monster,
    placement: PatternPlacement,
): PlacedMonster {
    return createPlacedMonster(
        `monster-${state.nextMonsterId}`,
        monster,
        player,
        placement.position,
        [...placement.cells],
        state.turn,
    );
}

function evaluateSummonPlacement(
    state: MatchState,
    player: PlayerId,
    monster: Monster,
    placement: PatternPlacement,
    snapshot: StrategicSnapshot,
): number {
    const reserves = byPlayer((owner) => ({ ...state.reserves[owner] }));
    reserves[player].invocation -= monster.cost;
    const candidate = createSummonedMonsterCandidate(state, player, monster, placement);
    const strategicScore = evaluateStrategicState({
        ...snapshot,
        monsters: [...state.monsters, candidate],
        reserves,
    });
    return (
        strategicScore -
        getPlacementReplyPenalty(
            { ...state, monsters: [...state.monsters, candidate], reserves },
            snapshot.board,
            player,
        )
    );
}

function getGuardPriority(defend: boolean, tactic: BotTactic, hasBackstabThreat: boolean): number {
    if (defend) return 1;
    return tactic === "hunt" || hasBackstabThreat ? 0.45 : 0.1;
}

function createPlacementScorer(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
    context: SummonSearchContext,
) {
    const { starts, ownCells, enemyPositions } = context;
    const blockedCells = getBlockedCells(state, board);
    const opponent = opposingPlayer(player);
    const tactic = state.tactics[player];
    const expansionObjective = chooseBotObjective(
        tactic,
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
        ...blockedCells,
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
    const threatened = enemyPositions.some((enemy) => getGridDistance(enemy, starts[player]) <= 5);
    const formation = createFormationScorer(board, state.monsters, player, starts[player]);
    const defend = tactic === "defense" || threatened;
    const guardPriority = getGuardPriority(defend, tactic, formation.hasBackstabThreat);
    const pathBlockadeScore =
        defend || tactic === "hunt"
            ? createPathBlockadeScorer(
                  board.width,
                  board.height,
                  starts[player],
                  starts[opponent],
                  ownCells,
                  blockedCells,
                  weights,
              )
            : () => 0;
    const strategicCellScore = createStrategicCellScorer(
        createStrategicSnapshot(state, board, player),
        player,
    );
    const positionScores = new Map<number, number>();
    const scoreSpawn = (position: Position, cells: readonly Position[]) => {
        const i = position.y * board.width + position.x;
        let score = positionScores.get(i);
        if (score === undefined) {
            score =
                strategicCellScore(position) * 0.5 * weights.strategicPlacement +
                (defend ? defensivePlacementScore(position) * weights.defensivePlacement : 0) -
                getGridDistance(position, expansionObjective) * (defend ? 1 : 4);
            positionScores.set(i, score);
        }
        return (
            score + formation.spawn(position, cells) * guardPriority * weights.defensivePlacement
        );
    };
    return {
        scoreSpawn,
        scorePlacement: (_position: Position, cells: readonly Position[]) =>
            territoryExpansionScore(cells) * (defend ? 0.35 : 1) * weights.territoryExpansion +
            pathBlockadeScore(cells) * weights.pathBlockade +
            formation.footprint(cells) * guardPriority * weights.defensiveCoverage,
    };
}

export function findPlacement(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
): PatternPlacement | null {
    const context = createSummonSearchContext(state, board, player);
    return findValidPlacement({
        ...context.options,
        ...createPlacementScorer(state, board, player, context),
    });
}

export function findBestSummonPlacementPair(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
    monsters: readonly Monster[],
): SummonChoice | null {
    const context = createSummonSearchContext(state, board, player);
    const { scoreSpawn, scorePlacement } = createPlacementScorer(state, board, player, context);
    const placements = findValidPlacements({ ...context.options, scoreSpawn })
        .map((placement) => ({
            ...placement,
            score:
                scorePlacement(placement.position, placement.cells) +
                scoreSpawn(placement.position, placement.cells),
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
    let bestPair: SummonChoice | null = null;
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
    return hasValidPlacement(createSummonSearchContext(state, board, player).options);
}
