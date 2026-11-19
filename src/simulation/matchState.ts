import { PLACEMENT_PATTERNS } from "../data/placementPatterns";
import { getInitialAttackCooldowns, getInitialAttackUses } from "../game/monsterActions";
import type { GameConfiguration } from "../game/gameConfiguration";
import { getStartingPositions, type BoardDefinition } from "../game/boards";
import { getInvokedMonsterCount } from "../game/matchRules";
import { findValidPlacement } from "../game/placement";
import type { PlayerId, PlacedMonster, Position } from "../types/GameTypes";
import {
    canDeployMonsterForProfile,
    chooseBotObjective,
    createDefensivePlacementScorer,
    createPathBlockadeScorer,
    describeDeploymentChoice,
    scoreMonsterForProfile,
    scoreTerritoryExpansion,
    type BotTactic,
} from "../game/botStrategy";
import { getMonsterSymbol } from "../game/monsterSymbols";
import type {
    BotProfile,
    FinalBoard,
    MatchResult,
    PlayerSimulationStats,
    SimulationEvent,
} from "./types";
import { createStrategicCellScorer, type StrategicSnapshot } from "../game/ai";

export interface MatchState {
    turn: number;
    currentPlayer: PlayerId;
    debug?: boolean;
    profiles: Record<PlayerId, BotProfile>;
    tactics: Record<PlayerId, BotTactic>;
    allowBaseAttackOnSummonTurn: boolean;
    winner: PlayerId | null;
    finishReason: MatchResult["finishReason"];
    health: Record<PlayerId, number>;
    reserves: Record<PlayerId, { invocation: number; attack: number; movement: number }>;
    monsters: PlacedMonster[];
    history: SimulationEvent[];
    statistics: Record<PlayerId, PlayerSimulationStats>;
    nextMonsterId: number;
    monstersKilledForVictory: number;
}

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
        ineffectiveActions: 0,
        decisionsWithoutImpact: 0,
        decisionTimeMs: 0,
        positionsExplored: 0,
        branchesExplored: 0,
    };
}

export function addEvent(
    state: MatchState,
    player: PlayerId,
    type: SimulationEvent["type"],
    description: string,
    details: Partial<SimulationEvent> = {},
): void {
    state.history.push({ turn: state.turn, player, type, description, ...details });
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
    const rows = Array.from({ length: board.height }, (_, y) =>
        Array.from({ length: board.width }, (_, x) => {
            const placed = state.monsters.find(
                (monster) =>
                    monster.currentHp > 0 && monster.position.x === x && monster.position.y === y,
            );
            if (placed) return getMonsterSymbol(monsterSymbols, placed.monster.id);
            if (board.blockedCells.some((cell) => cell.x === x && cell.y === y)) return "#";
            if (starts[1].x === x && starts[1].y === y) return "1";
            if (starts[2].x === x && starts[2].y === y) return "2";
            const territoryOwner = state.monsters.find((monster) =>
                monster.cells.some((cell) => cell.x === x && cell.y === y),
            )?.owner;
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

function findPlacement(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
): { position: Position; cells: Position[] } | null {
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
    const expansionObjective = chooseBotObjective(
        state.tactics[player],
        starts[player],
        starts[opposingPlayer(player)],
        enemyPositions,
        starts[player],
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
    const pathBlockadeScore =
        state.tactics[player] === "defense" || state.tactics[player] === "hunt"
            ? createPathBlockadeScorer(
                  board.width,
                  board.height,
                  starts[player],
                  starts[opposingPlayer(player)],
                  ownCells,
                  board.blockedCells,
              )
            : () => 0;
    const ownKeys = new Set([starts[player], ...ownCells].map(({ x, y }) => `${x},${y}`));
    const enemyKeys = new Set(
        [starts[opposingPlayer(player)], ...opponentCells].map(({ x, y }) => `${x},${y}`),
    );
    const livingMonsterKeys = new Set(
        state.monsters
            .filter((monster) => monster.currentHp > 0)
            .map(({ position }) => `${position.x},${position.y}`),
    );
    const snapshot: StrategicSnapshot = {
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
    const strategicCellScore = createStrategicCellScorer(snapshot, player);
    return findValidPlacement({
        patterns: PLACEMENT_PATTERNS,
        boardWidth: board.width,
        boardHeight: board.height,
        start: starts[player],
        occupiedCells,
        connectedCells: [starts[player], ...ownCells],
        overlappingCells: ownCells,
        blockedCells: [...board.blockedCells],
        isPlacementAllowed: (position, cells) => {
            const key = `${position.x},${position.y}`;
            return (
                !enemyKeys.has(key) &&
                !livingMonsterKeys.has(key) &&
                cells.some((cell) => !ownKeys.has(`${cell.x},${cell.y}`)) &&
                !cells.some((cell) => enemyKeys.has(`${cell.x},${cell.y}`))
            );
        },
        scorePlacement: (position, cells) => {
            return (
                scoreTerritoryExpansion(
                    player,
                    cells,
                    ownCells,
                    starts[player],
                    expansionObjective,
                ) +
                (state.tactics[player] === "defense" || state.tactics[player] === "hunt"
                    ? defensivePlacementScore(position)
                    : 0) +
                pathBlockadeScore(cells) +
                strategicCellScore(position) * 0.5
            );
        },
    });
}

export function hasAvailablePlacement(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
): boolean {
    return findPlacement(state, board, player) !== null;
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
    deck: readonly string[],
): void {
    const deckMonsters = deck.map((id) => {
        const monster = configuration.monsters.find((candidate) => candidate.id === id);
        if (!monster) throw new Error(`Monstre inconnu dans le deck : ${id}`);
        return monster;
    });
    const profileScores = new Map(
        deckMonsters.map((monster) => [monster.id, scoreMonsterForProfile(monster, profile)]),
    );

    while (
        getInvokedMonsterCount(state.monsters, state.currentPlayer) <
            configuration.maxMonstersPerPlayer &&
        state.winner === null
    ) {
        const placement = findPlacement(state, board, state.currentPlayer);
        if (!placement) return;
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
        const choices = (preferredMonsters.length > 0 ? preferredMonsters : affordableMonsters)
            .sort((first, second) => {
                return (
                    (summonedByMonster[first.id] ?? 0) - (summonedByMonster[second.id] ?? 0) ||
                    (profileScores.get(second.id) ?? 0) - (profileScores.get(first.id) ?? 0) ||
                    first.cost - second.cost
                );
            });
        const monster = choices[0];
        if (!monster || !spend(state, state.currentPlayer, "invocation", monster.cost)) return;

        const placed: PlacedMonster = {
            id: `m${state.nextMonsterId++}`,
            monster,
            owner: state.currentPlayer,
            position: placement.position,
            facing: state.currentPlayer === 1 ? "east" : "west",
            currentHp: monster.hp,
            cells: placement.cells,
            summonedOnTurn: state.turn,
            attacksUsedThisTurn: 0,
            attackUsesThisTurn: getInitialAttackUses(monster),
            movementsUsedThisTurn: 0,
            attackCooldowns: getInitialAttackCooldowns(monster),
            statusEffects: [],
        };
        state.monsters.push(placed);
        const stats = state.statistics[state.currentPlayer];
        stats.summoned++;
        stats.summonedByMonster[monster.id] = (stats.summonedByMonster[monster.id] ?? 0) + 1;
        addEvent(
            state,
            state.currentPlayer,
            "strategy",
            describeDeploymentChoice(monster, profile),
            {
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
            },
        );
        addEvent(
            state,
            state.currentPlayer,
            "invocation",
            `${monster.name} invoqué pour ${monster.cost} symbole(s).`,
            {
                monsterId: placed.id,
                monsterTypeId: monster.id,
                monsterName: monster.name,
                cost: monster.cost,
                to: placement.position,
            },
        );
    }
}
