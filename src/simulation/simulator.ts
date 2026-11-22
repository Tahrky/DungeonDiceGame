import { DICE } from "../data/dice";
import { getDefaultBoard, type BoardDefinition } from "../game/boards";
import { getDefaultGameConfiguration, type GameConfiguration } from "../game/gameConfiguration";
import { getInvokedMonsterCount } from "../game/matchRules";
import { getRollableDieFaces } from "../game/diceResources";
import {
    canUseActionThisTurn,
    getMovementActionsPerTurn,
    getMovementCost,
} from "../game/monsterActions";
import type { Monster, PlayerId } from "../types/GameTypes";
import {
    addEvent,
    buildMatchBoard,
    createStats,
    deployMonsters,
    hasAvailablePlacement,
    type MatchState,
} from "./matchState";
import { beginTurn, finishPlayerTurn, getLegalAttackCosts, performAttacks } from "./combat";
import { performMovements } from "./movement";
import { chooseDeck } from "./strategies";
import {
    canDeployMonsterForProfile,
    chooseBotTactic,
    chooseSymbolConversion,
    DEFAULT_BOT_STRATEGY_WEIGHTS,
    parseBotStrategyWeightMap,
    scoreMonsterForProfile,
} from "../game/botStrategy";
import { convertReservedSymbols } from "../game/diceResources";
import { getMonsterSymbol, getUniqueMonsterSymbols } from "../game/monsterSymbols";
import type { BotProfile, MatchResult, SimulationBatchResult, SimulationOptions } from "./types";
import { BOT_PROFILES } from "./types";
import { createTrainingFingerprint } from "./trainingVersioning";

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
    monstersById: ReadonlyMap<string, Monster>,
): MatchResult {
    const random = createRandom(seed);
    const profiles: Record<PlayerId, BotProfile> = {
        1: options.profile1,
        2: options.profile2,
    };
    const strategyWeights = {
        1: options.strategyWeights?.[profiles[1]] ?? DEFAULT_BOT_STRATEGY_WEIGHTS,
        2: options.strategyWeights?.[profiles[2]] ?? DEFAULT_BOT_STRATEGY_WEIGHTS,
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
                strategyWeights[1],
            ),
        2:
            options.deck2 ??
            chooseDeck(
                configuration.monsters,
                options.profile2,
                configuration.deckSize,
                deckRandom[2],
                strategyWeights[2],
            ),
    };
    const deckMonsters: Record<PlayerId, Monster[]> = {
        1: resolveDeck(decks[1], monstersById),
        2: resolveDeck(decks[2], monstersById),
    };
    const monsterSymbols = getUniqueMonsterSymbols(configuration.monsters);
    const state: MatchState = {
        turn: 1,
        currentPlayer: startingPlayer,
        debug: options.debug ?? false,
        protectFirstDeployment: configuration.protectFirstDeployment,
        strategyWeights,
        ...(options.recordDecisionTraces ? { decisionTraces: [] } : {}),
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
        movementStagnation: {},
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

            const excludeInvocation =
                configuration.removeInvocationDiceWhenNoMonsters &&
                getInvokedMonsterCount(state.monsters, player) >=
                    configuration.maxMonstersPerPlayer;
            const rolled = DICE.slice(0, configuration.diceCount).map((die) => {
                const faces = getRollableDieFaces(die, excludeInvocation);
                return faces[Math.floor(random() * faces.length)]!;
            });
            for (const symbol of rolled) state.reserves[player][symbol]++;
            addEvent(state, {
                turn,
                player,
                type: "dice",
                description: `Dés : ${rolled.join(", ")}. Ressources conservées en réserve.`,
            });
            addEvent(state, {
                turn,
                player,
                type: "strategy",
                description: `Profil « ${profiles[player]} » ; deck : ${decks[player].join(", ")}.`,
            });
            const decision = chooseBotTactic(profiles[player], profiles[player === 1 ? 2 : 1]);
            state.tactics[player] = decision.tactic;
            addEvent(state, {
                turn,
                player,
                type: "strategy",
                description: `Décision stratégique : ${decision.description}.`,
            });

            const deployedCosts = state.monsters
                .filter((monster) => monster.owner === player)
                .map((monster) => monster.monster.cost);
            const canInvoke =
                getInvokedMonsterCount(state.monsters, player) <
                    configuration.maxMonstersPerPlayer &&
                hasAvailablePlacement(state, board, player);
            const invocableMonsters = canInvoke
                ? deckMonsters[player].filter((monster) =>
                      canDeployMonsterForProfile(monster, profiles[player], deployedCosts),
                  )
                : [];
            if (
                getInvokedMonsterCount(state.monsters, player) <
                    configuration.maxMonstersPerPlayer &&
                !canInvoke
            ) {
                state.statistics[player].noLegalPlacementTurns++;
                if (
                    deckMonsters[player].some(
                        (monster) =>
                            monster.cost <= state.reserves[player].invocation &&
                            canDeployMonsterForProfile(monster, profiles[player], deployedCosts),
                    )
                ) {
                    state.statistics[player].blockedInvocationAttempts++;
                    state.statistics[player].actionsSkippedByReason.noLegalPlacement =
                        (state.statistics[player].actionsSkippedByReason.noLegalPlacement ?? 0) + 1;
                }
            }

            const attackCosts = getLegalAttackCosts(state, board);
            for (;;) {
                const reserve = state.reserves[player];
                const affordableInvocationCosts = canInvoke
                    ? invocableMonsters
                          .filter((monster) => monster.cost <= reserve.invocation)
                          .map((monster) => monster.cost)
                    : [];
                const affordableAttackCosts = attackCosts.filter((cost) => cost <= reserve.attack);
                const protectedCounts = {
                    invocation: affordableInvocationCosts.length
                        ? Math.min(...affordableInvocationCosts)
                        : 0,
                    attack: affordableAttackCosts.length ? Math.min(...affordableAttackCosts) : 0,
                    movement: 0,
                };
                for (const monster of state.monsters) {
                    if (
                        monster.owner !== player ||
                        monster.currentHp <= 0 ||
                        !canUseActionThisTurn(
                            monster.movementsUsedThisTurn,
                            getMovementActionsPerTurn(monster.monster),
                        )
                    ) {
                        continue;
                    }
                    const cost = getMovementCost(
                        monster.monster,
                        monster.turnBuffs?.movementCostReduction ?? 0,
                    );
                    if (cost <= reserve.movement) {
                        protectedCounts.movement =
                            protectedCounts.movement === 0
                                ? cost
                                : Math.min(protectedCounts.movement, cost);
                    }
                }
                const opportunities = {
                    invocation: invocableMonsters.reduce((best, monster) => {
                        return monster.cost > reserve.invocation
                            ? Math.max(
                                  best,
                                  Math.max(
                                      1,
                                      scoreMonsterForProfile(
                                          monster,
                                          profiles[player],
                                          strategyWeights[player],
                                      ) + 1,
                                  ) *
                                      strategyWeights[player].invocationPriority +
                                      (getInvokedMonsterCount(state.monsters, player) === 0
                                          ? 2
                                          : 0),
                              )
                            : best;
                    }, 0),
                    attack: attackCosts.reduce(
                        (best, cost) => (cost > reserve.attack ? Math.max(best, 1) : best),
                        0,
                    ),
                    movement: state.monsters.some((monster) => {
                        if (
                            monster.owner !== player ||
                            monster.currentHp <= 0 ||
                            !canUseActionThisTurn(
                                monster.movementsUsedThisTurn,
                                getMovementActionsPerTurn(monster.monster),
                            )
                        ) {
                            return false;
                        }
                        const cost = getMovementCost(
                            monster.monster,
                            monster.turnBuffs?.movementCostReduction ?? 0,
                        );
                        return cost > reserve.movement;
                    })
                        ? 1
                        : 0,
                };
                const choice = chooseSymbolConversion(reserve, opportunities, {
                    ...protectedCounts,
                });
                if (!choice) break;
                if (!convertReservedSymbols(reserve, choice.sourceSymbols, choice.targetSymbol))
                    break;
                state.statistics[player].conversionLosses++;
                addEvent(state, {
                    turn,
                    player,
                    type: "strategy",
                    description: `Conversion tactique : ${choice.sourceSymbols.join(" + ")} vers ${choice.targetSymbol}.`,
                });
            }

            const turnStartStats = state.statistics[player];
            const summonsAtTurnStart = turnStartStats.summoned;
            const attacksAtTurnStart = turnStartStats.attacks;
            const movementsAtTurnStart = turnStartStats.movements;
            deployMonsters(state, configuration, board, profiles[player], deckMonsters[player]);
            performAttacks(state, board);
            performMovements(state, board);
            performAttacks(state, board);
            const stats = state.statistics[player];
            if (stats.summoned === summonsAtTurnStart) stats.turnsWithoutSummon++;
            if (stats.attacks === attacksAtTurnStart) stats.turnsWithoutAttack++;
            if (stats.movements === movementsAtTurnStart) stats.turnsWithoutMovement++;
            if (
                stats.summoned === summonsAtTurnStart &&
                stats.attacks === attacksAtTurnStart &&
                stats.movements === movementsAtTurnStart
            ) {
                stats.turnsWithoutUsefulAction++;
            }
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
            isCamouflaged: monster.isCamouflaged === true,
            ...(monster.turnBuffs === undefined ? {} : { turnBuffs: monster.turnBuffs }),
        })),
        remainingResources: state.reserves,
        history: state.history,
        ...(state.decisionTraces === undefined ? {} : { decisionTraces: state.decisionTraces }),
    };
}

function resolveDeck(
    deck: readonly string[],
    monstersById: ReadonlyMap<string, Monster>,
): Monster[] {
    return deck.map((id) => {
        const monster = monstersById.get(id);
        if (!monster) throw new Error(`Monstre inconnu dans le deck : ${id}`);
        return monster;
    });
}

export function runSimulations(
    options: SimulationOptions,
    configuration = getDefaultGameConfiguration(),
    board = getDefaultBoard(),
    startIndex = 0,
    onMatchComplete?: (completedMatches: number) => void,
): SimulationBatchResult {
    if (!Number.isInteger(options.games) || options.games < 1) {
        throw new RangeError("Le nombre de matchs doit être un entier positif.");
    }
    if (!Number.isInteger(options.maxTurns) || options.maxTurns < 1) {
        throw new RangeError("La limite de tours doit être un entier positif.");
    }
    if (options.strategyWeights && !parseBotStrategyWeightMap(options.strategyWeights)) {
        throw new RangeError("Les poids stratégiques sont invalides.");
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

    const monstersById = new Map<string, Monster>();
    for (const monster of configuration.monsters) {
        if (!monstersById.has(monster.id)) monstersById.set(monster.id, monster);
    }
    const matches = Array.from({ length: options.games }, (_, index) => {
        const matchIndex = startIndex + index;
        const profilePairCount = options.profilePairs?.length ?? 1;
        const pairIndex = matchIndex % profilePairCount;
        const repetitionIndex = Math.floor(matchIndex / profilePairCount);
        const profilePair = options.profilePairs?.[pairIndex];
        const match = createMatch(
            matchIndex + 1,
            (options.seed + matchIndex) >>> 0,
            (pairIndex + repetitionIndex) % 2 === 0 ? 1 : 2,
            profilePair ? { ...options, ...profilePair } : options,
            configuration,
            board,
            monstersById,
        );
        onMatchComplete?.(index + 1);
        return match;
    });
    const wins: Record<PlayerId, number> = { 1: 0, 2: 0 };
    const winsByStartingPlayer: Record<PlayerId, number> = { 1: 0, 2: 0 };
    const winsByProfile: Partial<Record<BotProfile, number>> = {};
    let draws = 0;
    let totalTurns = 0;
    for (const match of matches) {
        totalTurns += match.turns;
        if (match.winner === null) {
            draws++;
            continue;
        }
        wins[match.winner]++;
        if (match.winner === match.startingPlayer) winsByStartingPlayer[match.startingPlayer]++;
        const winnerProfile = match.profiles[match.winner];
        winsByProfile[winnerProfile] = (winsByProfile[winnerProfile] ?? 0) + 1;
    }

    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        fingerprint: createTrainingFingerprint(configuration, board),
        options,
        configuration,
        board,
        summary: {
            matches: matches.length,
            wins,
            winsByStartingPlayer,
            draws,
            averageTurns: totalTurns / matches.length,
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
