import type { BoardDefinition } from "../../game/boards";
import { opposingPlayer } from "../../game/matchRules";
import { resetAttackTurnState } from "../../game/monsterActions";
import type { PlayerId } from "../../types/GameTypes";
import { cloneMatchState, type MatchState } from "../matchState";
import { executeAttack } from "./attackExecution";
import { getAvailableAttackChoices, type AttackChoice } from "./attackChoices";
import { getExpectedAttackDiceOutcomes, SINGLE_ATTACK_DIE } from "./attackDice";
import { getTacticalSearchCandidates } from "./searchCandidates";
import {
    applyChoiceToClone,
    createSearchCacheKey,
    DECISIVE_SCORE,
    evaluatePosition,
    TACTICAL_SEARCH_CONFIGURATION,
} from "./searchState";
import { chanceValue, minValue } from "./expectiminimax";

const ROOT_FOLLOW_UP_WEIGHT = 0.1;
const DEEP_FOLLOW_UP_WEIGHT = 0.05;
const ROOT_DEPTH = 1;

interface TacticalSearch {
    board: BoardDefinition;
    rootPlayer: PlayerId;
    baseline: number;
    nodes: number;
    maxDepth: number;
    cache: Map<string, number>;
}

function evaluateRelative(state: MatchState, search: TacticalSearch): number {
    return evaluatePosition(state, search.board, search.rootPlayer) - search.baseline;
}

function getDecisiveScore(winner: PlayerId | null, rootPlayer: PlayerId): number | undefined {
    if (winner === null) return undefined;
    return winner === rootPlayer ? DECISIVE_SCORE : -DECISIVE_SCORE;
}

function chooseAttackWithoutSearch(state: MatchState, board: BoardDefinition): AttackChoice | null {
    return getAvailableAttackChoices(state, board)[0] ?? null;
}

function continueGreedyAttackPhase(state: MatchState, board: BoardDefinition): void {
    while (state.winner === null) {
        const choice = chooseAttackWithoutSearch(state, board);
        if (!choice) return;
        executeAttack(state, board, choice);
    }
}

function simulateOpponentAttackPhase(state: MatchState, board: BoardDefinition): void {
    if (state.completeAttackPhases) {
        continueGreedyAttackPhase(state, board);
        return;
    }
    const reply = chooseAttackWithoutSearch(state, board);
    if (reply) executeAttack(state, board, reply);
}

function prepareAttackPhase(state: MatchState, player: PlayerId, attackDice = 1): void {
    state.currentPlayer = player;
    state.reserves[player].attack += attackDice;
    for (const monster of state.monsters) {
        if (monster.owner === player && monster.currentHp > 0) resetAttackTurnState(monster);
    }
}

function playCandidate(
    state: MatchState,
    board: BoardDefinition,
    candidate: AttackChoice,
): MatchState | undefined {
    const branch = applyChoiceToClone(state, board, candidate);
    if (branch?.winner === null && state.completeAttackPhases) {
        continueGreedyAttackPhase(branch, board);
    }
    return branch;
}

function scoreOpponentReplies(
    state: MatchState,
    search: TacticalSearch,
    branch: MatchState,
    candidateScore: number,
    phases: number,
    depth: number,
): number {
    const { board, rootPlayer } = search;
    const opponent = opposingPlayer(rootPlayer);
    const isRoot = depth === ROOT_DEPTH;
    const stats = state.statistics[rootPlayer];
    let score = 0;
    for (const { attackDice, probability } of isRoot
        ? getExpectedAttackDiceOutcomes(branch, opponent)
        : SINGLE_ATTACK_DIE) {
        const reply = cloneMatchState(branch);
        prepareAttackPhase(reply, opponent, attackDice);
        const exploredBeforeReply = reply.statistics[opponent].positionsExplored;
        simulateOpponentAttackPhase(reply, board);
        const replyPositionsExplored =
            reply.statistics[opponent].positionsExplored - exploredBeforeReply;
        stats.positionsExplored += replyPositionsExplored;
        stats.branchesExplored += replyPositionsExplored;

        let outcomeScore = getDecisiveScore(reply.winner, rootPlayer);
        if (outcomeScore === undefined && phases > 1) {
            prepareAttackPhase(reply, rootPlayer);
            outcomeScore = searchFutureAttackPhases(reply, search, phases - 1, depth + 1);
        }
        outcomeScore ??=
            evaluateRelative(reply, search) +
            candidateScore * (isRoot ? ROOT_FOLLOW_UP_WEIGHT : DEEP_FOLLOW_UP_WEIGHT);
        score += probability * outcomeScore;
    }
    return score;
}

function searchFutureAttackPhases(
    state: MatchState,
    search: TacticalSearch,
    phases: number,
    depth: number,
): number {
    const { board, rootPlayer } = search;
    if (search.nodes >= TACTICAL_SEARCH_CONFIGURATION.nodeBudget || phases <= 0) {
        return evaluateRelative(state, search);
    }
    search.maxDepth = Math.max(search.maxDepth, depth);

    const cacheKey = createSearchCacheKey(state, rootPlayer, depth);
    const cached = search.cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const candidates = getTacticalSearchCandidates(
        state,
        board,
        rootPlayer,
        getAvailableAttackChoices(state, board),
    );
    let best = Number.NEGATIVE_INFINITY;
    let budgetExhausted = false;
    for (const candidate of candidates) {
        if (search.nodes >= TACTICAL_SEARCH_CONFIGURATION.nodeBudget) {
            budgetExhausted = true;
            break;
        }
        search.nodes++;
        const branch = playCandidate(state, board, candidate);
        if (!branch) continue;
        best = Math.max(
            best,
            getDecisiveScore(branch.winner, rootPlayer) ??
                scoreOpponentReplies(state, search, branch, candidate.score, phases, depth),
        );
    }

    const result = best === Number.NEGATIVE_INFINITY ? evaluateRelative(state, search) : best;
    if (!budgetExhausted) search.cache.set(cacheKey, result);
    return result;
}

function recordSearchResult(
    state: MatchState,
    search: TacticalSearch,
    bestChoice: AttackChoice,
    selected: AttackChoice,
): AttackChoice {
    const stats = state.statistics[search.rootPlayer];
    stats.searchNodes += search.nodes;
    stats.maxSearchDepthReached = Math.max(stats.maxSearchDepthReached, search.maxDepth);
    if (
        selected.attacker.id !== bestChoice.attacker.id ||
        selected.attackIndex !== bestChoice.attackIndex
    ) {
        stats.decisionsChangedBySearch++;
    }
    return selected;
}

export function searchBestAttack(
    state: MatchState,
    board: BoardDefinition,
    choices: readonly AttackChoice[],
    bestChoice: AttackChoice,
): AttackChoice {
    const player = state.currentPlayer;
    const stats = state.statistics[player];
    const search: TacticalSearch = {
        board,
        rootPlayer: player,
        baseline: evaluatePosition(state, board, player),
        nodes: 0,
        maxDepth: ROOT_DEPTH,
        cache: new Map(),
    };
    const candidates = getTacticalSearchCandidates(state, board, player, choices);
    stats.positionsExplored += candidates.length;
    stats.searchDecisions++;
    stats.branchesExplored += candidates.length;
    stats.nodesBeyondFirstThree += Math.max(0, candidates.length - 3);

    let selected = bestChoice;
    let selectedScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
        if (search.nodes >= TACTICAL_SEARCH_CONFIGURATION.nodeBudget) break;
        search.nodes++;
        const branch = playCandidate(state, board, candidate);
        if (!branch) continue;
        if (branch.winner === player)
            return recordSearchResult(state, search, bestChoice, candidate);

        const score = scoreOpponentReplies(
            state,
            search,
            branch,
            candidate.score,
            TACTICAL_SEARCH_CONFIGURATION.depth,
            ROOT_DEPTH,
        );
        if (score > selectedScore) {
            selected = candidate;
            selectedScore = score;
        }
    }
    return recordSearchResult(state, search, bestChoice, selected);
}

export function searchBestAttackExpectiminimax(
    state: MatchState,
    board: BoardDefinition,
    choices: readonly AttackChoice[],
    bestChoice: AttackChoice,
): AttackChoice {
    const rootPlayer = state.currentPlayer;
    const opponent = opposingPlayer(rootPlayer);
    const config = state.expectiminimaxConfig ?? TACTICAL_SEARCH_CONFIGURATION;
    const maxDepth =
        "maxDepth" in config ? config.maxDepth : config.depth;
    const stats = state.statistics[rootPlayer];
    const candidates = getTacticalSearchCandidates(
        state,
        board,
        rootPlayer,
        choices,
    ).slice(0, config.branchWidth);
    const cache = new Map<string, number>();
    let nodes = 0;
    let budgetReached = false;
    let selected = bestChoice;
    let selectedScore = Number.NEGATIVE_INFINITY;

    stats.searchDecisions++;
    stats.positionsExplored += candidates.length;
    stats.branchesExplored += candidates.length;
    stats.nodesBeyondFirstThree += Math.max(0, candidates.length - 3);
    stats.maxSearchDepthReached = Math.max(stats.maxSearchDepthReached, 1);

    for (const candidate of candidates) {
        if (nodes >= config.nodeBudget) {
            budgetReached = true;
            break;
        }
        nodes++;
        const rootBranch = applyChoiceToClone(state, board, candidate);
        if (!rootBranch) continue;
        if (rootBranch.winner !== null) {
            const decisive = getDecisiveScore(rootBranch.winner, rootPlayer);
            if (decisive !== undefined && decisive > selectedScore) {
                selected = candidate;
                selectedScore = decisive;
            }
            continue;
        }

        const score = chanceValue(
            getExpectedAttackDiceOutcomes(rootBranch, opponent).map((outcome) => ({
                outcome,
                probability: outcome.probability,
            })),
            ({ attackDice }) => {
                const replyState = cloneMatchState(rootBranch);
                prepareAttackPhase(replyState, opponent, attackDice);
                const replyChoices = getAvailableAttackChoices(replyState, board, undefined, false);
                const replyCandidates = getTacticalSearchCandidates(
                    replyState,
                    board,
                    opponent,
                    replyChoices,
                ).slice(0, config.branchWidth);
                if (replyCandidates.length === 0) {
                    return evaluatePosition(replyState, board, rootPlayer);
                }

                return minValue(replyCandidates, (reply) => {
                    if (nodes >= config.nodeBudget) {
                        budgetReached = true;
                        return evaluatePosition(replyState, board, rootPlayer);
                    }
                    nodes++;
                    const replyBranch = applyChoiceToClone(replyState, board, reply);
                    if (!replyBranch) return evaluatePosition(replyState, board, rootPlayer);
                    if (replyBranch.winner !== null) {
                        return getDecisiveScore(replyBranch.winner, rootPlayer) ??
                            evaluatePosition(replyBranch, board, rootPlayer);
                    }

                    const cacheKey = createSearchCacheKey(replyBranch, rootPlayer, 2);
                    const cached = cache.get(cacheKey);
                    if (cached !== undefined) {
                        stats.transpositionsUsed++;
                        return cached;
                    }
                    const evaluated = evaluatePosition(replyBranch, board, rootPlayer);
                    cache.set(cacheKey, evaluated);
                    stats.positionsExplored++;
                    return evaluated;
                });
            },
        );

        if (score > selectedScore) {
            selected = candidate;
            selectedScore = score;
        }
    }

    stats.searchNodes += nodes;
    stats.branchesExplored += nodes;
    stats.maxSearchDepthReached = Math.max(stats.maxSearchDepthReached, maxDepth);
    if (budgetReached) stats.searchBudgetReached++;
    if (
        selected.attacker.id !== bestChoice.attacker.id ||
        selected.attackIndex !== bestChoice.attackIndex
    ) {
        stats.decisionsChangedBySearch++;
    }
    return selected;
}
