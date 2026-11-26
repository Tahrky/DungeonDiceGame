import type { GameConfiguration } from "../game/gameConfiguration";
import type { BoardDefinition } from "../game/boards";
import { canInvokeMonster, getInvokedMonsterCount } from "../game/matchRules";
import type { PatternPlacement } from "../game/placement";
import { shuffle } from "../game/random";
import type { Monster } from "../types/GameTypes";
import {
    canDeployMonsterForProfile,
    choosesRandomActions,
    describeDeploymentChoice,
    scoreMonsterForProfile,
    DEFAULT_BOT_STRATEGY_WEIGHTS,
} from "../game/botStrategy";
import type { BotProfile } from "./types";
import type { BotAction } from "./botAction";
import { addEvent, canSpend, spend, type MatchState } from "./matchState";
import {
    createSummonedMonsterCandidate,
    findBestSummonPlacementPair,
    findPlacement,
    type SummonChoice,
} from "./summonPlacement";

function rankDeploymentChoices(
    state: MatchState,
    profile: BotProfile,
    affordableMonsters: readonly Monster[],
    profileScores: ReadonlyMap<string, number>,
): Monster[] {
    const player = state.currentPlayer;
    const summonedByMonster = state.statistics[player].summonedByMonster;
    const swarmPenalty = profile === "cheap" ? 3 : 2;
    const getDiversityPenalty = (monster: Monster) =>
        monster.attacks.filter((attack) => attack.targetsAlliesOnly).length * 4 +
        (summonedByMonster[monster.id] ?? 0) * swarmPenalty;
    const deployedCosts = state.monsters
        .filter((monster) => monster.owner === player)
        .map((monster) => monster.monster.cost);
    const preferredMonsters = affordableMonsters.filter((monster) =>
        canDeployMonsterForProfile(monster, profile, deployedCosts),
    );
    const strategicChoices = (
        preferredMonsters.length > 0 ? preferredMonsters : [...affordableMonsters]
    ).sort(
        (first, second) =>
            getDiversityPenalty(second) - getDiversityPenalty(first) ||
            (summonedByMonster[first.id] ?? 0) - (summonedByMonster[second.id] ?? 0) ||
            (profileScores.get(second.id) ?? 0) - (profileScores.get(first.id) ?? 0) ||
            first.cost - second.cost,
    );
    return choosesRandomActions(profile)
        ? shuffle(strategicChoices, state.actionRandom?.[player])
        : strategicChoices;
}

function selectSummon(
    state: MatchState,
    board: BoardDefinition,
    choices: readonly Monster[],
    placement: PatternPlacement | null,
): SummonChoice | null {
    const monster = choices[0];
    if (!monster) return null;
    if (!state.summonPlacementPairs) return placement && { monster, placement };
    return findBestSummonPlacementPair(state, board, state.currentPlayer, choices);
}

function summonMonster(
    state: MatchState,
    configuration: GameConfiguration,
    profile: BotProfile,
    { monster, placement }: SummonChoice,
    candidateCount: number,
): void {
    const player = state.currentPlayer;
    const placed = createSummonedMonsterCandidate(state, player, monster, placement);
    state.nextMonsterId++;
    state.monsters.push(placed);
    const stats = state.statistics[player];
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
        player,
        type: "strategy",
        description: describeDeploymentChoice(monster, profile),
        monsterId: placed.id,
        monsterName: monster.name,
        ...(state.debug
            ? {
                  debug: {
                      situation: `invoquer J${player}, réservation=${state.reserves[player].invocation}`,
                      candidates: candidateCount,
                      depth: 1,
                      positionsExplored: state.monsters.length,
                      selectedAction: monster.name,
                  },
              }
            : {}),
    });
    addEvent(state, {
        turn: state.turn,
        player,
        type: "invocation",
        description: `${monster.name} invoqué pour ${monster.cost} symbole(s).`,
        monsterId: placed.id,
        monsterTypeId: monster.id,
        monsterName: monster.name,
        cost: monster.cost,
        to: placement.position,
    });
}

export interface DeploymentDecision {
    summon: SummonChoice;
    candidateCount: number;
}

export function createDeploymentDecider(
    state: MatchState,
    configuration: GameConfiguration,
    board: BoardDefinition,
    profile: BotProfile,
    deckMonsters: readonly Monster[],
): () => DeploymentDecision | null {
    const player = state.currentPlayer;
    const weights = state.strategyWeights?.[player] ?? DEFAULT_BOT_STRATEGY_WEIGHTS;
    const profileScores = new Map(
        deckMonsters.map((monster) => [
            monster.id,
            scoreMonsterForProfile(monster, profile, weights),
        ]),
    );

    return () => {
        if (state.currentPlayer !== player) {
            throw new Error("Le décideur d'invocation appartient à un autre joueur.");
        }
        if (
            getInvokedMonsterCount(state.monsters, player) >= configuration.maxMonstersPerPlayer ||
            state.winner !== null
        ) {
            return null;
        }
        const affordableMonsters = deckMonsters.filter(
            (monster) =>
                canSpend(state, player, "invocation", monster.cost) &&
                canInvokeMonster(state.monsters, player, monster.id, configuration),
        );
        if (affordableMonsters.length === 0) return null;
        const placement = state.summonPlacementPairs ? null : findPlacement(state, board, player);
        if (!state.summonPlacementPairs && !placement) return null;
        const choices = rankDeploymentChoices(state, profile, affordableMonsters, profileScores);
        const summon = selectSummon(state, board, choices, placement);
        return summon ? { summon, candidateCount: choices.length } : null;
    };
}

export function executeDeployment(
    state: MatchState,
    configuration: GameConfiguration,
    profile: BotProfile,
    { summon, candidateCount }: DeploymentDecision,
): boolean {
    if (!canInvokeMonster(state.monsters, state.currentPlayer, summon.monster.id, configuration)) {
        return false;
    }
    if (!spend(state, state.currentPlayer, "invocation", summon.monster.cost)) return false;
    summonMonster(state, configuration, profile, summon, candidateCount);
    return true;
}

export function deployMonsters(
    state: MatchState,
    configuration: GameConfiguration,
    board: BoardDefinition,
    profile: BotProfile,
    deckMonsters: readonly Monster[],
): void {
    for (const action of decideDeployments(state, configuration, board, profile, deckMonsters)) {
        if (!executeDeploymentAction(state, configuration, profile, action, deckMonsters)) return;
    }
}

export function executeDeploymentAction(
    state: MatchState,
    configuration: GameConfiguration,
    profile: BotProfile,
    action: Extract<BotAction, { type: "summon" }>,
    deckMonsters: readonly Monster[],
): boolean {
    const monster = deckMonsters.find(({ id }) => id === action.monsterId);
    if (!monster) throw new Error(`Monstre à invoquer introuvable : ${action.monsterId}`);
    return executeDeployment(state, configuration, profile, {
        summon: { monster, placement: action.placement },
        candidateCount: action.candidateCount,
    });
}

export function* decideDeployments(
    state: MatchState,
    configuration: GameConfiguration,
    board: BoardDefinition,
    profile: BotProfile,
    deckMonsters: readonly Monster[],
): Generator<Extract<BotAction, { type: "summon" }>> {
    const decide = createDeploymentDecider(state, configuration, board, profile, deckMonsters);
    for (;;) {
        const decision = decide();
        if (!decision) return;
        yield {
            type: "summon",
            monsterId: decision.summon.monster.id,
            placement: decision.summon.placement,
            candidateCount: decision.candidateCount,
        };
    }
}
