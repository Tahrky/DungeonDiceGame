import { DICE } from "../data/dice";
import { getDefaultBoard, type BoardDefinition } from "../game/boards";
import { getDefaultGameConfiguration, type GameConfiguration } from "../game/gameConfiguration";
import type { PlayerId } from "../types/GameTypes";
import { buildMatchBoard, createStats, deployMonsters, type MatchState } from "./matchState";
import { beginTurn, finishPlayerTurn, performAttacks } from "./combat";
import { performMovements } from "./movement";
import { chooseDeck } from "./strategies";
import {
    chooseBotTactic,
    chooseSymbolConversion,
    scoreMonsterForProfile,
} from "../game/botStrategy";
import { convertReservedSymbols } from "../game/diceResources";
import { getMonsterSymbol, getUniqueMonsterSymbols } from "../game/monsterSymbols";
import type { BotProfile, MatchResult, SimulationBatchResult, SimulationOptions } from "./types";
import { BOT_PROFILES } from "./types";

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
    const deckRandom: Record<PlayerId, () => number> = {
        1: createRandom((seed ^ 0x9e3779b9) >>> 0),
        2: createRandom((seed ^ 0x85ebca6b) >>> 0),
    };
    const decks: Record<PlayerId, string[]> = {
        1:
            options.deck1 ??
            chooseDeck(
                configuration.monsters,
                options.profile1,
                configuration.deckSize,
                deckRandom[1],
            ),
        2:
            options.deck2 ??
            chooseDeck(
                configuration.monsters,
                options.profile2,
                configuration.deckSize,
                deckRandom[2],
            ),
    };
    const monsterSymbols = getUniqueMonsterSymbols(configuration.monsters);
    const state: MatchState = {
        turn: 1,
        currentPlayer: startingPlayer,
        debug: options.debug ?? false,
        profiles,
        tactics: {
            1: chooseBotTactic(profiles[1], profiles[2]).tactic,
            2: chooseBotTactic(profiles[2], profiles[1]).tactic,
        },
        allowBaseAttackOnSummonTurn: configuration.allowBaseAttackOnSummonTurn,
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
        const turnOrder: readonly [PlayerId, PlayerId] = startingPlayer === 1 ? [1, 2] : [2, 1];
        for (const player of turnOrder) {
            if (state.winner !== null) break;
            if (turn > 1 || player !== startingPlayer) beginTurn(state, configuration, player);
            else state.currentPlayer = player;
            if (state.winner !== null) break;

            const rolled = DICE.slice(0, configuration.diceCount).map(
                (die) => die.faces[Math.floor(random() * die.faces.length)]!,
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
                description: `Profil « ${profiles[player]} » ; deck : ${decks[player].join(", ")}.`,
            });
            const decision = chooseBotTactic(profiles[player], profiles[player === 1 ? 2 : 1]);
            state.tactics[player] = decision.tactic;
            state.history.push({
                turn,
                player,
                type: "strategy",
                description: `Décision stratégique : ${decision.description}.`,
            });

            for (let conversion = 0; conversion < 3; conversion++) {
                const reserve = state.reserves[player];
                const opportunities = {
                    invocation: decks[player].reduce((best, id) => {
                        const monster = configuration.monsters.find(
                            (candidate) => candidate.id === id,
                        );
                        return monster && monster.cost <= reserve.invocation + 1
                            ? Math.max(best, scoreMonsterForProfile(monster, profiles[player]) + 1)
                            : best;
                    }, 0),
                    attack: state.monsters
                        .filter(
                            (monster) =>
                                monster.owner === player &&
                                monster.currentHp > 0 &&
                                monster.attacksUsedThisTurn <
                                    (monster.monster.attackActionsPerTurn ?? 1),
                        )
                        .reduce(
                            (best, monster) =>
                                Math.max(
                                    best,
                                    ...monster.monster.attacks.map((attack) =>
                                        attack.cost <= reserve.attack + 1 ? 1 : 0,
                                    ),
                                ),
                            0,
                        ),
                    movement: state.monsters.some(
                        (monster) =>
                            monster.owner === player &&
                            monster.currentHp > 0 &&
                            monster.movementsUsedThisTurn <
                                (monster.monster.movementActionsPerTurn ?? 1),
                    )
                        ? 1
                        : 0,
                };
                const choice = chooseSymbolConversion(reserve, opportunities, {
                    invocation: 1,
                    attack: 1,
                    movement: 1,
                });
                if (!choice) break;
                if (!convertReservedSymbols(reserve, choice.sourceSymbols, choice.targetSymbol))
                    break;
                state.history.push({
                    turn,
                    player,
                    type: "strategy",
                    description: `Conversion tactique : ${choice.sourceSymbols.join(" + ")} vers ${choice.targetSymbol}.`,
                });
            }

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
        finalBoard: buildMatchBoard(board, state, monsterSymbols, configuration.monsters),
        finalMonsters: state.monsters.map((monster) => ({
            id: monster.id,
            monsterId: monster.monster.id,
            name: monster.monster.name,
            symbol: getMonsterSymbol(monsterSymbols, monster.monster.id),
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
    startIndex = 0,
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
    if (
        options.profilePairs !== undefined &&
        (options.profilePairs.length === 0 ||
            options.profilePairs.some(
                ({ profile1, profile2 }) =>
                    !BOT_PROFILES.includes(profile1) || !BOT_PROFILES.includes(profile2),
            ))
    ) {
        throw new RangeError("La liste des confrontations entre profils est invalide.");
    }
    if (!Number.isSafeInteger(startIndex) || startIndex < 0) {
        throw new RangeError("L’index de départ doit être un entier non négatif.");
    }

    const matches = Array.from({ length: options.games }, (_, index) => {
        const matchIndex = startIndex + index;
        const profilePair = options.profilePairs?.[matchIndex % options.profilePairs.length];
        return createMatch(
            matchIndex + 1,
            (options.seed + matchIndex) >>> 0,
            matchIndex % 2 === 0 ? 1 : 2,
            profilePair ? { ...options, ...profilePair } : options,
            configuration,
            board,
        );
    });
    const wins: Record<PlayerId, number> = {
        1: matches.filter((match) => match.winner === 1).length,
        2: matches.filter((match) => match.winner === 2).length,
    };
    const winsByStartingPlayer: Record<PlayerId, number> = {
        1: matches.filter(
            (match) => match.winner === match.startingPlayer && match.startingPlayer === 1,
        ).length,
        2: matches.filter(
            (match) => match.winner === match.startingPlayer && match.startingPlayer === 2,
        ).length,
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
            averageTurns: matches.reduce((sum, match) => sum + match.turns, 0) / matches.length,
            winsByProfile,
        },
        matches,
    };
}

export function runCrossProfileTournament(
    options: Omit<SimulationOptions, "profile1" | "profile2">,
    configuration = getDefaultGameConfiguration(),
    board = getDefaultBoard(),
): Array<{
    profile1: BotProfile;
    profile2: BotProfile;
    result: SimulationBatchResult;
}> {
    return BOT_PROFILES.flatMap((profile1, profileIndex) =>
        BOT_PROFILES.map((profile2, opponentIndex) => ({
            profile1,
            profile2,
            result: runSimulations(
                {
                    ...options,
                    seed:
                        (options.seed +
                            profileIndex * 0x0100_0000 +
                            opponentIndex * 0x0001_0000) >>>
                        0,
                    profile1,
                    profile2,
                },
                configuration,
                board,
            ),
        })),
    );
}
