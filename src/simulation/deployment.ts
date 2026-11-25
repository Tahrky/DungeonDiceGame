import type { GameConfiguration } from "../game/gameConfiguration";
import type { BoardDefinition } from "../game/boards";
import { getInvokedMonsterCount } from "../game/matchRules";
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

export function deployMonsters(
    state: MatchState,
    configuration: GameConfiguration,
    board: BoardDefinition,
    profile: BotProfile,
    deckMonsters: readonly Monster[],
): void {
    const player = state.currentPlayer;
    const weights = state.strategyWeights?.[player] ?? DEFAULT_BOT_STRATEGY_WEIGHTS;
    const profileScores = new Map(
        deckMonsters.map((monster) => [
            monster.id,
            scoreMonsterForProfile(monster, profile, weights),
        ]),
    );

    while (
        getInvokedMonsterCount(state.monsters, player) < configuration.maxMonstersPerPlayer &&
        state.winner === null
    ) {
        const affordableMonsters = deckMonsters.filter((monster) =>
            canSpend(state, player, "invocation", monster.cost),
        );
        if (affordableMonsters.length === 0) return;
        const placement = state.summonPlacementPairs ? null : findPlacement(state, board, player);
        if (!state.summonPlacementPairs && !placement) return;
        const choices = rankDeploymentChoices(state, profile, affordableMonsters, profileScores);
        const summon = selectSummon(state, board, choices, placement);
        if (!summon || !spend(state, player, "invocation", summon.monster.cost)) return;
        summonMonster(state, configuration, profile, summon, choices.length);
    }
}
