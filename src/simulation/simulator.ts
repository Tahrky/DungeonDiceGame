import { DICE } from "../data/dice";
import {
    getDefaultBoard,
    type BoardDefinition,
} from "../game/boards";
import { getDefaultGameConfiguration, type GameConfiguration } from "../game/gameConfiguration";
import type { PlayerId } from "../types/GameTypes";
import {
    buildMatchBoard,
    createStats,
    deployMonsters,
    type MatchState,
} from "./matchState";
import { beginTurn, finishPlayerTurn, performAttacks } from "./combat";
import { performMovements } from "./movement";
import { chooseDeck } from "./strategies";
import type {
    BotProfile,
    MatchResult,
    SimulationBatchResult,
    SimulationOptions,
} from "./types";

function createRandom(seed: number): () => number {
    let value = seed || 0x6d2b79f5;
    return () => {
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        return (value >>> 0) / 0x1_0000_0000;
    };
}

function createMatch(
    id: number,
    seed: number,
    startingPlayer: PlayerId,
    options: SimulationOptions,
    configuration: GameConfiguration,
    board: BoardDefinition,
): MatchResult {
    const random = createRandom(seed);
    const profiles: Record<PlayerId, BotProfile> = {
        1: options.profile1,
        2: options.profile2,
    };
    const decks: Record<PlayerId, string[]> = {
        1:
            options.deck1 ??
            chooseDeck(configuration.monsters, options.profile1, configuration.deckSize),
        2:
            options.deck2 ??
            chooseDeck(configuration.monsters, options.profile2, configuration.deckSize),
    };
    const state: MatchState = {
        turn: 1,
        currentPlayer: startingPlayer,
        profiles,
        winner: null,
        finishReason: "turnLimit",
        health: {
            1: configuration.initialPlayerHealth,
            2: configuration.initialPlayerHealth,
        },
        reserves: {
            1: { invocation: 0, attack: 0, movement: 0 },
            2: { invocation: 0, attack: 0, movement: 0 },
        },
        monsters: [],
        history: [],
        statistics: { 1: createStats(), 2: createStats() },
        nextMonsterId: 1,
        monstersKilledForVictory: configuration.monstersKilledForVictory,
    };

    for (let turn = 1; turn <= options.maxTurns && state.winner === null; turn++) {
        state.turn = turn;
        const turnOrder: readonly [PlayerId, PlayerId] =
            startingPlayer === 1 ? [1, 2] : [2, 1];
        for (const player of turnOrder) {
            if (state.winner !== null) break;
            if (turn > 1 || player !== startingPlayer) beginTurn(state, configuration, player);
            else state.currentPlayer = player;
            if (state.winner !== null) break;

            const rolled = DICE.slice(0, configuration.diceCount).map((die) =>
                die.faces[Math.floor(random() * die.faces.length)]!,
            );
            for (const symbol of rolled) state.reserves[player][symbol]++;
            state.history.push({
                turn,
                player,
                type: "dice",
                description: `Dés : ${rolled.join(", ")}. Ressources conservées en réserve.`,
            });
            state.history.push({
                turn,
                player,
                type: "strategy",
                description:
                    `Profil « ${profiles[player]} » ; deck : ${decks[player].join(", ")}.`,
            });

            deployMonsters(state, configuration, board, profiles[player], decks[player]);
            performAttacks(state, board);
            performMovements(state, board);
            performAttacks(state, board);
            finishPlayerTurn(state, player);
        }
    }

    return {
        id,
        seed,
        startingPlayer,
        profiles,
        decks,
        winner: state.winner,
        finishReason: state.finishReason,
        turns: state.turn,
        playerHealth: state.health,
        statistics: state.statistics,
        finalBoard: buildMatchBoard(board, state),
        finalMonsters: state.monsters.map((monster) => ({
            id: monster.id,
            monsterId: monster.monster.id,
            name: monster.monster.name,
            owner: monster.owner,
            hp: monster.currentHp,
            maxHp: monster.monster.hp,
            position: monster.position,
            cells: monster.cells,
            statusEffects: monster.statusEffects,
            ...(monster.turnBuffs === undefined ? {} : { turnBuffs: monster.turnBuffs }),
        })),
        remainingResources: state.reserves,
        history: state.history,
    };
}

export function runSimulations(
    options: SimulationOptions,
    configuration = getDefaultGameConfiguration(),
    board = getDefaultBoard(),
): SimulationBatchResult {
    if (!Number.isInteger(options.games) || options.games < 1) {
        throw new RangeError("Le nombre de matchs doit être un entier positif.");
    }
    if (!Number.isInteger(options.maxTurns) || options.maxTurns < 1) {
        throw new RangeError("La limite de tours doit être un entier positif.");
    }
    if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffff_ffff) {
        throw new RangeError("La seed doit être un entier non signé de 32 bits.");
    }

    const matches = Array.from({ length: options.games }, (_, index) =>
        createMatch(
            index + 1,
            (options.seed + index) >>> 0,
            index % 2 === 0 ? 1 : 2,
            options,
            configuration,
            board,
        ),
    );
    const wins: Record<PlayerId, number> = {
        1: matches.filter((match) => match.winner === 1).length,
        2: matches.filter((match) => match.winner === 2).length,
    };
    const winsByStartingPlayer: Record<PlayerId, number> = {
        1: matches.filter((match) => match.winner === match.startingPlayer && match.startingPlayer === 1)
            .length,
        2: matches.filter((match) => match.winner === match.startingPlayer && match.startingPlayer === 2)
            .length,
    };
    const winsByProfile: Partial<Record<BotProfile, number>> = {};
    for (const match of matches) {
        if (match.winner === null) continue;
        const winnerProfile = match.profiles[match.winner];
        winsByProfile[winnerProfile] = (winsByProfile[winnerProfile] ?? 0) + 1;
    }

    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        options,
        configuration,
        board,
        summary: {
            matches: matches.length,
            wins,
            winsByStartingPlayer,
            draws: matches.filter((match) => match.winner === null).length,
            averageTurns:
                matches.reduce((sum, match) => sum + match.turns, 0) / matches.length,
            winsByProfile,
        },
        matches,
    };
}
