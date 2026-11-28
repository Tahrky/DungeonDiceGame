import { getDefaultBoard, type BoardDefinition } from "../game/boards";
import { createBotDecisionSettings } from "../game/botConfiguration";
import {
    chooseBotTactic,
    DEFAULT_BOT_STRATEGY_WEIGHTS,
    parseBotStrategyWeightMap,
} from "../game/botStrategy";
import { createEmptyDiceReserve } from "../game/diceResources";
import { getDefaultGameConfiguration, type GameConfiguration } from "../game/gameConfiguration";
import { byPlayer, opposingPlayer } from "../game/matchRules";
import { getMonsterSymbol, getUniqueMonsterSymbols } from "../game/monsterSymbols";
import {
    createMatchRandomStreams,
    createSeededRandom,
    type MatchRandomStreams,
} from "../game/random";
import type { Monster, PlacedMonster, PlayerId } from "../types/GameTypes";
import { isPlainRecord } from "../utils/guards";
import { beginTurn } from "./combat";
import { buildMatchBoard } from "./finalBoard";
import { createStats, type MatchState } from "./matchState";
import { playPlayerTurn, type PlayerTurnContext } from "./playerTurn";
import { chooseDeck } from "./strategies";
import { createTrainingFingerprint } from "./training/versioning";
import {
    BOT_PROFILES,
    type BotProfile,
    type FinalMonster,
    type MatchResult,
    type SimulationBatchResult,
    type SimulationOptions,
} from "./types";

const DECK_SEED_SALTS: Record<PlayerId, number> = { 1: 0x9e3779b9, 2: 0x85ebca6b };

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

export function createInitialState(
    options: SimulationOptions,
    configuration: GameConfiguration,
    startingPlayer: PlayerId,
    strategyWeights: MatchState["strategyWeights"],
    randomStreams: MatchRandomStreams,
): MatchState {
    const profiles: Record<PlayerId, BotProfile> = { 1: options.profile1, 2: options.profile2 };
    return {
        turn: 1,
        currentPlayer: startingPlayer,
        startingPlayer,
        debug: options.debug ?? false,
        protectFirstDeployment: configuration.protectFirstDeployment,
        ...createBotDecisionSettings(configuration, options),
        strategyWeights,
        decisionTraces: options.recordDecisionTraces ? [] : undefined,
        profiles,
        tactics: byPlayer(
            (player) => chooseBotTactic(profiles[player], profiles[opposingPlayer(player)]).tactic,
        ),
        allowBaseAttackOnSummonTurn: configuration.allowBaseAttackOnSummonTurn,
        winner: null,
        finishReason: "turnLimit",
        health: byPlayer(() => configuration.initialPlayerHealth),
        reserves: byPlayer(() => createEmptyDiceReserve()),
        monsters: [],
        movementStagnation: {},
        history: [],
        statistics: byPlayer(() => createStats()),
        nextMonsterId: 1,
        monstersKilledForVictory: configuration.monstersKilledForVictory,
        actionRandom: randomStreams.actions,
    };
}

function toFinalMonster(
    monster: PlacedMonster,
    monsterSymbols: ReadonlyMap<string, string>,
): FinalMonster {
    return {
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
    const optionDecks = { 1: options.deck1, 2: options.deck2 };
    const optionProfiles = { 1: options.profile1, 2: options.profile2 };
    const strategyWeights = byPlayer(
        (player) =>
            options.strategyWeights?.[optionProfiles[player]] ?? DEFAULT_BOT_STRATEGY_WEIGHTS,
    );
    const decks = byPlayer(
        (player) =>
            optionDecks[player] ??
            chooseDeck(
                configuration.monsters,
                optionProfiles[player],
                configuration.deckSize,
                createSeededRandom((seed ^ DECK_SEED_SALTS[player]) >>> 0),
                strategyWeights[player],
            ),
    );
    const randomStreams = createMatchRandomStreams(seed);
    const state = createInitialState(
        options,
        configuration,
        startingPlayer,
        strategyWeights,
        randomStreams,
    );
    const context: PlayerTurnContext = {
        state,
        configuration,
        board,
        random: randomStreams.dice,
        decks,
        deckMonsters: byPlayer((player) => resolveDeck(decks[player], monstersById)),
        strategyWeights,
    };
    const turnOrder = [startingPlayer, opposingPlayer(startingPlayer)] as const;
    const turnDurationsMs = options.measureTurnDurations
        ? byPlayer(() => [] as number[])
        : undefined;

    for (let turn = 1; turn <= options.maxTurns && state.winner === null; turn++) {
        state.turn = turn;
        for (const player of turnOrder) {
            if (state.winner !== null) break;
            if (turn > 1 || player !== startingPlayer) beginTurn(state, configuration, player);
            else state.currentPlayer = player;
            if (state.winner !== null) break;
            state.movementAttackCombos =
                options.playerOptions?.[player]?.movementAttackCombos ??
                options.movementAttackCombos === true;
            state.summonPlacementPairs =
                options.playerOptions?.[player]?.summonPlacementPairs ??
                options.summonPlacementPairs === true;
            state.expectiminimax =
                options.playerOptions?.[player]?.expectiminimax ?? options.expectiminimax === true;
            const startedAt = turnDurationsMs ? performance.now() : 0;
            playPlayerTurn(context, player);
            if (turnDurationsMs) turnDurationsMs[player].push(performance.now() - startedAt);
        }
    }

    const monsterSymbols = getUniqueMonsterSymbols(configuration.monsters);
    return {
        id,
        seed,
        startingPlayer,
        profiles: state.profiles,
        decks,
        winner: state.winner,
        finishReason: state.finishReason,
        turns: state.turn,
        playerHealth: state.health,
        statistics: state.statistics,
        finalBoard: buildMatchBoard(board, state, monsterSymbols, configuration.monsters),
        finalMonsters: state.monsters.map((monster) => toFinalMonster(monster, monsterSymbols)),
        remainingResources: state.reserves,
        history: state.history,
        ...(state.decisionTraces === undefined ? {} : { decisionTraces: state.decisionTraces }),
        ...(turnDurationsMs ? { turnDurationsMs } : {}),
    };
}

function validateSimulationOptions(options: SimulationOptions, startIndex: number): void {
    if (
        options.measureTurnDurations !== undefined &&
        typeof options.measureTurnDurations !== "boolean"
    ) {
        throw new RangeError("L’option de mesure des tours est invalide.");
    }
    if (options.playerOptions !== undefined) {
        const players: unknown = options.playerOptions;
        if (
            !isPlainRecord(players) ||
            Object.entries(players).some(
                ([player, value]) =>
                    (player !== "1" && player !== "2") ||
                    !isPlainRecord(value) ||
                    Object.entries(value).some(
                        ([key, enabled]) =>
                            (key !== "movementAttackCombos" &&
                                key !== "summonPlacementPairs" &&
                                key !== "expectiminimax") ||
                            typeof enabled !== "boolean",
                    ),
            )
        ) {
            throw new RangeError("Les options de simulation par joueur sont invalides.");
        }
    }
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
        options.profilePairs?.length === 0 ||
        options.profilePairs?.some(
            ({ profile1, profile2 }) =>
                !BOT_PROFILES.includes(profile1) || !BOT_PROFILES.includes(profile2),
        )
    ) {
        throw new RangeError("La liste des confrontations entre profils est invalide.");
    }
    if (!Number.isSafeInteger(startIndex) || startIndex < 0) {
        throw new RangeError("L’index de départ doit être un entier non négatif.");
    }
}

function summarizeMatches(matches: readonly MatchResult[]): SimulationBatchResult["summary"] {
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
        matches: matches.length,
        wins,
        winsByStartingPlayer,
        draws,
        averageTurns: totalTurns / matches.length,
        winsByProfile,
    };
}

export function runSimulations(
    options: SimulationOptions,
    configuration = getDefaultGameConfiguration(),
    board = getDefaultBoard(),
    startIndex = 0,
    onMatchComplete?: (completedMatches: number) => void,
): SimulationBatchResult {
    validateSimulationOptions(options, startIndex);

    const monstersById = new Map<string, Monster>();
    for (const monster of configuration.monsters) {
        if (!monstersById.has(monster.id)) monstersById.set(monster.id, monster);
    }
    const profilePairCount = options.profilePairs?.length ?? 1;
    const matches = Array.from({ length: options.games }, (_, index) => {
        const matchIndex = startIndex + index;
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

    return {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        fingerprint: createTrainingFingerprint(configuration, board),
        options,
        configuration,
        board,
        summary: summarizeMatches(matches),
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
