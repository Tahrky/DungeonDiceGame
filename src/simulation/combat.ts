import { DICE } from "../data/dice";
import { getRollableDieFaces } from "../game/diceResources";
import {
    applyMonsterTurnBuff,
    canAttackBaseThisTurn,
    canAttackMonster,
    canDirectlyTargetMonster,
    canTargetMonsterOwner,
    clearCamouflageOnFirstAction,
    isAreaAttack,
    canUseActionThisTurn,
    canUseMonsterAttackThisTurn,
    clearMonsterTurnBuff,
    consumeAttackTurnBuff,
    getAttackActionsPerTurn,
    getAttackCost,
    getAttackDamage,
    getAttackZoneOptions,
    getFacingFromMovement,
    getGridDistance,
    getInitialAttackUses,
    hasLineOfSight,
    isBehind,
} from "../game/monsterActions";
import { getStartingPositions, isBoardCell, type BoardDefinition } from "../game/boards";
import { evaluateStrategicState, type StrategicSnapshot } from "../game/ai";
import { getInvokedMonsterCount, getMonsterEliminationWinner } from "../game/matchRules";
import {
    applyStatusEffectsAtTurnStart,
    clearStatusEffects,
    healMonster,
} from "../game/statusEffects";
import {
    DEFAULT_BOT_STRATEGY_WEIGHTS,
    scoreTacticalAttack,
    type TacticalAttackValue,
} from "../game/botStrategy";
import type {
    Monster,
    PlayerId,
    PlacedMonster,
    Position,
    StatusEffectDefinition,
} from "../types/GameTypes";
import {
    addEvent,
    canSpend,
    getPlayerMonsters,
    opposingPlayer,
    spend,
    type MatchState,
} from "./matchState";
import type { GameConfiguration } from "../game/gameConfiguration";

interface AttackChoice {
    attacker: PlacedMonster;
    attackIndex: number;
    target: Position;
    cells: Position[];
    score: number;
    features: TacticalAttackValue;
    isDefaultCandidate: boolean;
}

export function getAttackDiceCountDistribution(
    diceCount: number,
    excludeInvocation: boolean,
): Array<{ attackDice: number; probability: number }> {
    if (!Number.isInteger(diceCount) || diceCount < 0 || diceCount > DICE.length) {
        throw new RangeError(`Le nombre de dés doit être compris entre 0 et ${DICE.length}.`);
    }

    let probabilities = [1];
    for (const die of DICE.slice(0, diceCount)) {
        const faces = getRollableDieFaces(die, excludeInvocation);
        if (faces.length === 0) throw new Error(`Le dé ${die.id} n’a aucune face disponible.`);
        const attackProbability = faces.filter((face) => face === "attack").length / faces.length;
        const nextProbabilities = Array.from({ length: probabilities.length + 1 }, () => 0);
        for (const [attacks, probability] of probabilities.entries()) {
            nextProbabilities[attacks]! += probability * (1 - attackProbability);
            nextProbabilities[attacks + 1]! += probability * attackProbability;
        }
        probabilities = nextProbabilities;
    }

    return probabilities.flatMap((probability, attackDice) =>
        probability > 0 ? [{ attackDice, probability }] : [],
    );
}

function getExpectedAttackDiceOutcomes(
    state: MatchState,
    player: PlayerId,
    includeExpectation = true,
): Array<{ attackDice: number; probability: number }> {
    const configuration = state.nextTurnDice;
    if (!includeExpectation || !configuration) return [{ attackDice: 1, probability: 1 }];
    const excludeInvocation =
        configuration.removeInvocationDiceWhenNoMonsters &&
        getInvokedMonsterCount(state.monsters, player) >= configuration.maxMonstersPerPlayer;
    return getAttackDiceCountDistribution(configuration.count, excludeInvocation);
}

function hasJumpLanding(
    state: MatchState,
    board: BoardDefinition,
    attacker: PlacedMonster,
    cells: readonly Position[],
): boolean {
    const occupied = state.monsters
        .filter((monster) => monster.currentHp > 0 && monster.id !== attacker.id)
        .map((monster) => monster.position);
    const starts = Object.values(getStartingPositions(board));
    return cells.some(
        (cell) =>
            state.monsters.some((monster) =>
                monster.cells.some((deployed) => deployed.x === cell.x && deployed.y === cell.y),
            ) &&
            !occupied.some((position) => position.x === cell.x && position.y === cell.y) &&
            !starts.some((position) => position.x === cell.x && position.y === cell.y),
    );
}

function isValidAttackCell(
    state: MatchState,
    board: BoardDefinition,
    attacker: PlacedMonster,
    attack: Monster["attacks"][number],
    cell: Position,
): boolean {
    if (!isBoardCell(board, cell)) return false;
    if (
        attack.pattern.type === "jumpArea" &&
        getGridDistance(attacker.position, cell) > attack.pattern.range
    ) {
        return false;
    }
    const enemyStart = getStartingPositions(board)[opposingPlayer(state.currentPlayer)];
    if (cell.x === enemyStart.x && cell.y === enemyStart.y) {
        return (
            !attack.targetsAlliesOnly &&
            canAttackBaseThisTurn(
                attacker.summonedOnTurn,
                state.turn,
                state.allowBaseAttackOnSummonTurn,
            )
        );
    }

    const target = state.monsters.find(
        (monster) =>
            monster.currentHp > 0 && monster.position.x === cell.x && monster.position.y === cell.y,
    );
    if (!target || (target.id === attacker.id && !attack.targetsSelf)) return false;
    if (!canDirectlyTargetMonster(attack, target)) return false;
    if (!canTargetMonsterOwner(attack, target.owner, state.currentPlayer)) return false;
    if (
        attack.healAmount !== undefined &&
        target.currentHp >= target.monster.hp &&
        (!attack.clearsStatusEffects || target.statusEffects.length === 0)
    ) {
        return false;
    }
    if (
        attack.cooldownReduction !== undefined &&
        !target.attackCooldowns.some((cooldown) => cooldown > 0)
    ) {
        return false;
    }
    return canAttackMonster(attacker.monster, attack, target.monster);
}

function evaluateAttack(
    state: MatchState,
    board: BoardDefinition,
    attacker: PlacedMonster,
    attackIndex: number,
    target: Position,
    cells: readonly Position[],
): TacticalAttackValue {
    const attack = attacker.monster.attacks[attackIndex];
    const value: TacticalAttackValue = {
        damage: 0,
        kills: 0,
        statusDamage: 0,
        baseDamage: 0,
        healing: 0,
        clearedEffects: 0,
        buffs: 0,
        cooldownsReduced: 0,
        friendlyDamage: 0,
    };
    if (!attack) return value;

    if (attack.targetsAlliesOnly) {
        const ally = state.monsters.find(
            (monster) =>
                monster.currentHp > 0 &&
                monster.owner === state.currentPlayer &&
                monster.position.x === target.x &&
                monster.position.y === target.y,
        );
        if (!ally) return value;
        value.healing = Math.min(attack.healAmount ?? 0, ally.monster.hp - ally.currentHp);
        value.clearedEffects = attack.clearsStatusEffects ? ally.statusEffects.length : 0;
        value.cooldownsReduced = attack.cooldownReduction
            ? ally.attackCooldowns.filter((cooldown) => cooldown > 0).length
            : 0;
        value.buffs =
            (attack.movementRangeBonus ?? 0) +
            (attack.movementCostReduction ?? 0) +
            (attack.attackDamageBonus ?? 0) * 2 +
            (attack.attackCostReduction ?? 0);
        return value;
    }

    const enemyStart = getStartingPositions(board)[opposingPlayer(state.currentPlayer)];
    const canHitBase = canAttackBaseThisTurn(
        attacker.summonedOnTurn,
        state.turn,
        state.allowBaseAttackOnSummonTurn,
    );
    const affectedCells = isAreaAttack(attack) ? cells : [target];
    for (const cell of affectedCells) {
        if (!isBoardCell(board, cell)) continue;
        if (canHitBase && cell.x === enemyStart.x && cell.y === enemyStart.y) {
            value.baseDamage = 1;
            continue;
        }
        const victim = state.monsters.find(
            (monster) =>
                monster.currentHp > 0 &&
                monster.position.x === cell.x &&
                monster.position.y === cell.y,
        );
        if (!victim || (victim.id === attacker.id && !attack.targetsSelf)) continue;
        if (!canDirectlyTargetMonster(attack, victim)) continue;
        if (!canTargetMonsterOwner(attack, victim.owner, state.currentPlayer)) continue;
        if (!canAttackMonster(attacker.monster, attack, victim.monster)) continue;
        const backstab =
            !isAreaAttack(attack) &&
            cell.x === target.x &&
            cell.y === target.y &&
            victim.owner !== state.currentPlayer &&
            (attacker.monster.bonusDamageFromBehind ?? 0) > 0 &&
            isBehind(victim.position, attacker.position, victim.facing);
        const damage =
            getAttackDamage(attack, attacker.turnBuffs?.attackDamageBonus ?? 0) +
            (backstab ? (attacker.monster.bonusDamageFromBehind ?? 0) : 0);
        const effectiveDamage = Math.min(victim.currentHp, damage);
        if (victim.owner === state.currentPlayer) {
            if (attack.hitsAllies) value.friendlyDamage += effectiveDamage;
        } else {
            value.damage += effectiveDamage;
            if (damage >= victim.currentHp) value.kills++;
            const effect = attack.statusEffect;
            if (effect && !victim.statusEffects.some((existing) => existing.type === effect.type)) {
                value.statusDamage +=
                    effect.damagePerTurn *
                    Math.min(2, typeof effect.duration === "number" ? effect.duration : 2);
            }
        }
    }
    return value;
}

function getAttackChoices(
    state: MatchState,
    board: BoardDefinition,
    attacker: PlacedMonster,
    attackIndex: number,
): AttackChoice[] {
    const attack = attacker.monster.attacks[attackIndex];
    if (!attack) return [];
    return getLegalAttackOptions(state, board, attacker, attackIndex)
        .map((option) => {
            const features = evaluateAttack(
                state,
                board,
                attacker,
                attackIndex,
                option.target,
                option.cells,
            );
            const cost = getAttackCost(attack, attacker.turnBuffs?.attackCostReduction ?? 0);
            const tactic = state.tactics[state.currentPlayer];
            const profile = state.profiles[state.currentPlayer];
            const weights =
                state.strategyWeights?.[state.currentPlayer] ?? DEFAULT_BOT_STRATEGY_WEIGHTS;
            const score = scoreTacticalAttack(
                features,
                cost,
                tactic,
                state.health[opposingPlayer(state.currentPlayer)],
                profile,
                weights,
            );
            const defaultScore =
                weights === DEFAULT_BOT_STRATEGY_WEIGHTS
                    ? score
                    : scoreTacticalAttack(
                          features,
                          cost,
                          tactic,
                          state.health[opposingPlayer(state.currentPlayer)],
                          profile,
                          DEFAULT_BOT_STRATEGY_WEIGHTS,
                      );
            return {
                attacker,
                attackIndex,
                ...option,
                features,
                isDefaultCandidate: defaultScore > 0,
                score,
            };
        })
        .filter((choice) => choice.isDefaultCandidate);
}

function getLegalAttackOptions(
    state: MatchState,
    board: BoardDefinition,
    attacker: PlacedMonster,
    attackIndex: number,
) {
    const attack = attacker.monster.attacks[attackIndex];
    if (!attack) return [];
    const enemyStart = getStartingPositions(board)[opposingPlayer(state.currentPlayer)];
    const canHitBase = canAttackBaseThisTurn(
        attacker.summonedOnTurn,
        state.turn,
        state.allowBaseAttackOnSummonTurn,
    );
    const blockers = state.monsters
        .filter((monster) => monster.currentHp > 0 && monster.id !== attacker.id)
        .map((monster) => monster.position);

    return getAttackZoneOptions(
        attacker.position,
        attacker.facing,
        attack.pattern,
        attack.targetsSelf,
    ).filter(({ target, cells }) => {
        if (!isBoardCell(board, target)) return false;
        if (target.x === enemyStart.x && target.y === enemyStart.y && !canHitBase) {
            return false;
        }
        if (!isAreaAttack(attack) && !hasLineOfSight(attacker.position, target, blockers)) {
            return false;
        }
        if (attack.movesToZone && !hasJumpLanding(state, board, attacker, cells)) {
            return false;
        }
        return cells.some((cell) => isValidAttackCell(state, board, attacker, attack, cell));
    });
}

function getAvailableAttackChoices(
    state: MatchState,
    board: BoardDefinition,
    attackerId?: string,
    recordStatistics = true,
): AttackChoice[] {
    const choices: AttackChoice[] = [];
    for (const attacker of getPlayerMonsters(state, state.currentPlayer)) {
        if (attackerId !== undefined && attacker.id !== attackerId) continue;
        if (
            !canUseActionThisTurn(
                attacker.attacksUsedThisTurn,
                getAttackActionsPerTurn(attacker.monster),
            )
        ) {
            continue;
        }
        for (const [attackIndex, attack] of attacker.monster.attacks.entries()) {
            const cost = getAttackCost(attack, attacker.turnBuffs?.attackCostReduction ?? 0);
            if (
                !canSpend(state, state.currentPlayer, "attack", cost) ||
                (attacker.attackCooldowns[attackIndex] ?? 0) > 0 ||
                !canUseMonsterAttackThisTurn(attack, attacker.attackUsesThisTurn[attackIndex] ?? 0)
            ) {
                continue;
            }
            choices.push(...getAttackChoices(state, board, attacker, attackIndex));
        }
    }
    if (recordStatistics) {
        state.statistics[state.currentPlayer].positionsExplored += choices.length;
        state.statistics[state.currentPlayer].branchesExplored += choices.length;
    }
    choices.sort(
        (first, second) =>
            second.score - first.score ||
            (first.attacker.id < second.attacker.id
                ? -1
                : first.attacker.id > second.attacker.id
                  ? 1
                  : 0) ||
            first.attackIndex - second.attackIndex ||
            first.target.y - second.target.y ||
            first.target.x - second.target.x,
    );
    return choices;
}

export function getBestAvailableAttackScore(
    state: MatchState,
    board: BoardDefinition,
    attackerId: string,
): number {
    return getAvailableAttackChoices(state, board, attackerId, false)[0]?.score ?? 0;
}

export function getLegalAttackCosts(state: MatchState, board: BoardDefinition): number[] {
    const costs: number[] = [];
    for (const attacker of getPlayerMonsters(state, state.currentPlayer)) {
        if (
            !canUseActionThisTurn(
                attacker.attacksUsedThisTurn,
                getAttackActionsPerTurn(attacker.monster),
            )
        ) {
            continue;
        }
        for (const [attackIndex, attack] of attacker.monster.attacks.entries()) {
            if (
                (attacker.attackCooldowns[attackIndex] ?? 0) > 0 ||
                !canUseMonsterAttackThisTurn(attack, attacker.attackUsesThisTurn[attackIndex] ?? 0)
            ) {
                continue;
            }
            if (getLegalAttackOptions(state, board, attacker, attackIndex).length > 0) {
                costs.push(getAttackCost(attack, attacker.turnBuffs?.attackCostReduction ?? 0));
            }
        }
    }
    return costs;
}

export const TACTICAL_SEARCH_CONFIGURATION = {
    depth: 2,
    branchWidth: 5,
    nodeBudget: 250,
} as const;

export function cloneMatchState(state: MatchState): MatchState {
    const cloneMonster = (monster: PlacedMonster): PlacedMonster => ({
        ...monster,
        attackUsesThisTurn: [...monster.attackUsesThisTurn],
        attackCooldowns: [...monster.attackCooldowns],
        statusEffects: monster.statusEffects.map((effect) => ({
            ...effect,
            ...(effect.source ? { source: { ...effect.source } } : {}),
        })),
        ...(monster.turnBuffs ? { turnBuffs: { ...monster.turnBuffs } } : {}),
    });
    const cloneStats = (player: PlayerId) => ({
        ...state.statistics[player],
        summonedByMonster: { ...state.statistics[player].summonedByMonster },
        symbolsSpent: { ...state.statistics[player].symbolsSpent },
    });

    return {
        ...state,
        profiles: { ...state.profiles },
        tactics: { ...state.tactics },
        health: { ...state.health },
        reserves: {
            1: { ...state.reserves[1] },
            2: { ...state.reserves[2] },
        },
        monsters: state.monsters.map(cloneMonster),
        history: [],
        statistics: { 1: cloneStats(1), 2: cloneStats(2) },
    };
}

function createStrategicSnapshot(
    state: MatchState,
    board: BoardDefinition,
    player: PlayerId,
): StrategicSnapshot {
    return {
        board,
        health: state.health,
        initialHealth: Math.max(state.health[1], state.health[2], 1),
        monsters: state.monsters,
        reserves: state.reserves,
        profile: state.profiles[player],
        tactics: state.tactics,
        currentPlayer: player,
        turn: state.turn,
    };
}

function getTacticalSearchCandidates(
    state: MatchState,
    board: BoardDefinition,
    rootPlayer: PlayerId,
    choices: readonly AttackChoice[],
    branchWidth: number,
): AttackChoice[] {
    if (!state.broaderAttackCandidates) return choices.slice(0, branchWidth);

    const candidates: AttackChoice[] = [];
    const included = new Set<string>();
    const addCandidate = (choice: AttackChoice | undefined) => {
        if (!choice) return;
        const key = [
            choice.attacker.id,
            choice.attackIndex,
            choice.target.x,
            choice.target.y,
            choice.cells.map(({ x, y }) => `${x},${y}`).join(";"),
        ].join(":");
        if (included.has(key)) return;
        included.add(key);
        candidates.push(choice);
    };

    choices.slice(0, branchWidth).forEach(addCandidate);
    const bestByAttacker = new Map<string, AttackChoice>();
    for (const choice of choices) {
        if (!bestByAttacker.has(choice.attacker.id)) {
            bestByAttacker.set(choice.attacker.id, choice);
        }
    }
    for (const choice of bestByAttacker.values()) addCandidate(choice);

    const bestKill = choices.reduce<AttackChoice | undefined>((best, choice) => {
        if (choice.features.kills === 0) return best;
        return !best ||
            choice.features.kills > best.features.kills ||
            (choice.features.kills === best.features.kills && choice.score > best.score)
            ? choice
            : best;
    }, undefined);
    addCandidate(bestKill);

    let bestStrategicChoice: AttackChoice | undefined;
    let bestStrategicScore = Number.NEGATIVE_INFINITY;
    for (const choice of choices) {
        const branch = cloneMatchState(state);
        const attacker = branch.monsters.find((monster) => monster.id === choice.attacker.id);
        if (!attacker) continue;
        executeAttack(branch, board, {
            ...choice,
            attacker,
            target: { ...choice.target },
            cells: choice.cells.map((cell) => ({ ...cell })),
        });
        const score =
            branch.winner === rootPlayer
                ? 100_000
                : evaluateStrategicState(createStrategicSnapshot(branch, board, rootPlayer));
        if (score > bestStrategicScore) {
            bestStrategicChoice = choice;
            bestStrategicScore = score;
        }
    }
    addCandidate(bestStrategicChoice);
    return candidates;
}

interface TacticalSearchState {
    nodes: number;
    maxDepth: number;
    cache: Map<string, number>;
}

function createSearchCacheKey(
    state: MatchState,
    player: PlayerId,
    phasesRemaining: number,
    currentDepth: number,
    branchWidth: number,
): string {
    const monsters = state.monsters
        .map((monster) =>
            [
                monster.id,
                monster.owner,
                `${monster.position.x},${monster.position.y}`,
                monster.facing,
                monster.currentHp,
                monster.attacksUsedThisTurn,
                monster.attackUsesThisTurn.join(","),
                monster.attackCooldowns.join(","),
                monster.statusEffects
                    .map(
                        ({ type, remainingTurns, damagePerTurn }) =>
                            `${type}:${remainingTurns}:${damagePerTurn ?? 0}`,
                    )
                    .sort()
                    .join(","),
                monster.turnBuffs ? Object.values(monster.turnBuffs).join(",") : "",
            ].join(":"),
        )
        .sort()
        .join("|");
    return [
        player,
        state.currentPlayer,
        state.turn,
        state.health[1],
        state.health[2],
        state.reserves[1].attack,
        state.reserves[2].attack,
        phasesRemaining,
        currentDepth,
        branchWidth,
        monsters,
    ].join(":");
}

function searchFutureAttackPhases(
    state: MatchState,
    board: BoardDefinition,
    rootPlayer: PlayerId,
    phasesRemaining: number,
    currentDepth: number,
    branchWidth: number,
    nodeBudget: number,
    searchState: TacticalSearchState,
    baseline: number,
): number {
    if (searchState.nodes >= nodeBudget || phasesRemaining <= 0) {
        return evaluateStrategicState(createStrategicSnapshot(state, board, rootPlayer)) - baseline;
    }
    searchState.maxDepth = Math.max(searchState.maxDepth, currentDepth);

    const cacheKey = createSearchCacheKey(
        state,
        rootPlayer,
        phasesRemaining,
        currentDepth,
        branchWidth,
    );
    const cached = searchState.cache.get(cacheKey);
    if (cached !== undefined) return cached;

    const player = state.currentPlayer;
    const opponent = opposingPlayer(player);
    const choices = getTacticalSearchCandidates(
        state,
        board,
        rootPlayer,
        getAvailableAttackChoices(state, board),
        branchWidth,
    );
    if (choices.length === 0) {
        const score =
            evaluateStrategicState(createStrategicSnapshot(state, board, rootPlayer)) - baseline;
        searchState.cache.set(cacheKey, score);
        return score;
    }

    let best = Number.NEGATIVE_INFINITY;
    let budgetExhausted = false;
    for (const candidate of choices) {
        if (searchState.nodes >= nodeBudget) {
            budgetExhausted = true;
            break;
        }
        searchState.nodes++;
        state.statistics[player].searchNodes++;
        const branch = cloneMatchState(state);
        const attacker = branch.monsters.find((monster) => monster.id === candidate.attacker.id);
        if (!attacker) continue;
        executeAttack(branch, board, {
            ...candidate,
            attacker,
            target: { ...candidate.target },
            cells: candidate.cells.map((cell) => ({ ...cell })),
        });
        if (branch.winner === null && state.completeAttackPhases) {
            continueGreedyAttackPhase(branch, board);
        }
        if (branch.winner === rootPlayer) {
            best = Math.max(best, 100_000);
            continue;
        }
        if (branch.winner === opposingPlayer(rootPlayer)) {
            best = Math.max(best, -100_000);
            continue;
        }

        let expectedScore = 0;
        for (const opponentOutcome of getExpectedAttackDiceOutcomes(branch, opponent, false)) {
            const reply = cloneMatchState(branch);
            prepareOpponentReply(reply, opponent, opponentOutcome.attackDice);
            simulateOpponentAttackPhase(reply, board);

            let outcomeScore: number;
            if (reply.winner === rootPlayer) {
                outcomeScore = 100_000;
            } else if (reply.winner === opposingPlayer(rootPlayer)) {
                outcomeScore = -100_000;
            } else if (phasesRemaining > 1) {
                const nextPhase = cloneMatchState(reply);
                prepareOpponentReply(nextPhase, player);
                outcomeScore = searchFutureAttackPhases(
                    nextPhase,
                    board,
                    rootPlayer,
                    phasesRemaining - 1,
                    currentDepth + 1,
                    branchWidth,
                    nodeBudget,
                    searchState,
                    baseline,
                );
            } else {
                outcomeScore =
                    evaluateStrategicState(createStrategicSnapshot(reply, board, rootPlayer)) -
                    baseline +
                    candidate.score * 0.05;
            }
            expectedScore += opponentOutcome.probability * outcomeScore;
        }
        best = Math.max(best, expectedScore);
    }

    const result =
        best === Number.NEGATIVE_INFINITY
            ? evaluateStrategicState(createStrategicSnapshot(state, board, rootPlayer)) - baseline
            : best;
    if (!budgetExhausted) searchState.cache.set(cacheKey, result);
    return result;
}

function prepareOpponentReply(state: MatchState, player: PlayerId, attackDice: number = 1): void {
    state.currentPlayer = player;
    state.reserves[player].attack += attackDice;
    for (const monster of state.monsters) {
        if (monster.owner !== player || monster.currentHp <= 0) continue;
        monster.attacksUsedThisTurn = 0;
        monster.attackUsesThisTurn = getInitialAttackUses(monster.monster);
        monster.attackCooldowns = monster.attackCooldowns.map((cooldown) =>
            Math.max(0, cooldown - 1),
        );
    }
}

function chooseAttack(state: MatchState, board: BoardDefinition): AttackChoice | null {
    const choices = getAvailableAttackChoices(state, board);
    const bestChoice = choices[0];
    if (!bestChoice) return null;
    if (choices.length === 1) return recordAttackDecision(state, choices, bestChoice);

    const player = state.currentPlayer;
    if (state.profiles[player] === "random" || state.profiles[player] === "random-strategy") {
        const random = state.actionRandom?.[player]?.() ?? 0;
        const index = Math.min(
            choices.length - 1,
            Math.floor(Math.max(0, Math.min(1 - Number.EPSILON, random)) * choices.length),
        );
        return recordAttackDecision(state, choices, choices[index]!);
    }
    if (state.profiles[player] === "greedy") {
        return recordAttackDecision(state, choices, bestChoice);
    }
    const opponent: PlayerId = player === 1 ? 2 : 1;
    const { depth: searchDepth, branchWidth, nodeBudget } = TACTICAL_SEARCH_CONFIGURATION;
    const searchState = { nodes: 0, maxDepth: 1, cache: new Map<string, number>() };
    const recordSearchStatistics = () => {
        state.statistics[player].searchNodes += searchState.nodes;
        state.statistics[player].maxSearchDepthReached = Math.max(
            state.statistics[player].maxSearchDepthReached,
            searchState.maxDepth,
        );
    };
    const baseline = evaluateStrategicState(createStrategicSnapshot(state, board, player));
    const candidates = getTacticalSearchCandidates(state, board, player, choices, branchWidth);
    state.statistics[player].positionsExplored += candidates.length;
    state.statistics[player].searchDecisions++;
    state.statistics[player].branchesExplored += candidates.length;
    state.statistics[player].nodesBeyondFirstThree +=
        candidates.length > 3 ? candidates.length - 3 : 0;
    let selected = bestChoice;
    let selectedScore = Number.NEGATIVE_INFINITY;

    for (const candidate of candidates) {
        if (searchState.nodes >= nodeBudget) break;
        searchState.nodes++;
        const branch = cloneMatchState(state);
        const attacker = branch.monsters.find((monster) => monster.id === candidate.attacker.id);
        if (!attacker) continue;
        executeAttack(branch, board, {
            ...candidate,
            attacker,
            target: { ...candidate.target },
            cells: candidate.cells.map((cell) => ({ ...cell })),
        });
        if (branch.winner === null && state.completeAttackPhases) {
            continueGreedyAttackPhase(branch, board);
        }
        if (branch.winner === player) {
            recordSearchStatistics();
            if (
                candidate.attacker.id !== bestChoice.attacker.id ||
                candidate.attackIndex !== bestChoice.attackIndex
            ) {
                state.statistics[player].decisionsChangedBySearch++;
            }
            return recordAttackDecision(state, choices, candidate);
        }

        let score = 0;
        for (const opponentOutcome of getExpectedAttackDiceOutcomes(branch, opponent)) {
            const reply = cloneMatchState(branch);
            prepareOpponentReply(reply, opponent, opponentOutcome.attackDice);
            const exploredBeforeReply = reply.statistics[opponent].positionsExplored;
            simulateOpponentAttackPhase(reply, board);
            const replyPositionsExplored =
                reply.statistics[opponent].positionsExplored - exploredBeforeReply;
            state.statistics[player].positionsExplored += replyPositionsExplored;
            state.statistics[player].branchesExplored += replyPositionsExplored;

            let outcomeScore: number;
            if (reply.winner === player) {
                outcomeScore = 100_000;
            } else if (reply.winner === opponent) {
                outcomeScore = -100_000;
            } else if (searchDepth > 1) {
                prepareOpponentReply(reply, player);
                outcomeScore = searchFutureAttackPhases(
                    reply,
                    board,
                    player,
                    searchDepth - 1,
                    2,
                    branchWidth,
                    nodeBudget,
                    searchState,
                    baseline,
                );
            } else {
                outcomeScore =
                    evaluateStrategicState(createStrategicSnapshot(reply, board, player)) -
                    baseline +
                    candidate.score * 0.1;
            }
            score += opponentOutcome.probability * outcomeScore;
        }
        if (score > selectedScore) {
            selected = candidate;
            selectedScore = score;
        }
    }
    recordSearchStatistics();
    state.statistics[player].maxSearchDepthReached = Math.max(
        state.statistics[player].maxSearchDepthReached,
        searchState.maxDepth,
    );
    if (
        selected.attacker.id !== bestChoice.attacker.id ||
        selected.attackIndex !== bestChoice.attackIndex
    ) {
        state.statistics[player].decisionsChangedBySearch++;
    }
    return recordAttackDecision(state, choices, selected);
}

function recordAttackDecision(
    state: MatchState,
    choices: readonly AttackChoice[],
    selected: AttackChoice,
): AttackChoice {
    if (state.decisionTraces) {
        const candidates = choices.map((choice) => {
            return {
                attackerMonsterId: choice.attacker.monster.id,
                attackIndex: choice.attackIndex,
                target: { ...choice.target },
                features: { ...choice.features },
                score: choice.score,
            };
        });
        state.decisionTraces.push({
            turn: state.turn,
            player: state.currentPlayer,
            action: "attack",
            candidates,
            selectedIndex: choices.indexOf(selected),
        });
    }
    return selected;
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

function applyStatusEffect(
    target: PlacedMonster,
    effect: StatusEffectDefinition | undefined,
    source: PlacedMonster,
): void {
    if (target.currentHp <= 0) {
        clearStatusEffects(target);
    } else if (effect) {
        target.statusEffects = [
            ...target.statusEffects.filter((existing) => existing.type !== effect.type),
            {
                ...effect,
                remainingTurns: effect.duration,
                source: {
                    id: source.id,
                    monsterId: source.monster.id,
                    name: source.monster.name,
                    owner: source.owner,
                },
            },
        ];
    }
}

function damageBase(state: MatchState, player: PlayerId): void {
    const opponent = opposingPlayer(player);
    state.health[opponent]--;
    state.statistics[player].baseDamage++;
    if (state.health[opponent] <= 0) {
        state.health[opponent] = 0;
        state.winner = player;
        state.finishReason = "baseDestroyed";
    }
}

function getJumpLanding(
    state: MatchState,
    board: BoardDefinition,
    attacker: PlacedMonster,
    cells: readonly Position[],
): Position | undefined {
    const occupied = state.monsters
        .filter((monster) => monster.currentHp > 0 && monster.id !== attacker.id)
        .map((monster) => monster.position);
    const starts = Object.values(getStartingPositions(board));
    return cells
        .filter(
            (cell) =>
                state.monsters.some((monster) =>
                    monster.cells.some(
                        (deployed) => deployed.x === cell.x && deployed.y === cell.y,
                    ),
                ) &&
                !occupied.some((position) => position.x === cell.x && position.y === cell.y) &&
                !starts.some((position) => position.x === cell.x && position.y === cell.y),
        )
        .sort(
            (first, second) =>
                getGridDistance(attacker.position, first) -
                getGridDistance(attacker.position, second),
        )[0];
}

function executeAttack(state: MatchState, board: BoardDefinition, choice: AttackChoice): void {
    const { attacker, attackIndex, target, cells } = choice;
    const attack = attacker.monster.attacks[attackIndex];
    if (!attack) return;
    const player = state.currentPlayer;
    const targetMonster = state.monsters.find(
        (monster) =>
            monster.currentHp > 0 &&
            monster.position.x === target.x &&
            monster.position.y === target.y,
    );
    const attackDamageBonus = attacker.turnBuffs?.attackDamageBonus ?? 0;
    const cost = getAttackCost(attack, attacker.turnBuffs?.attackCostReduction ?? 0);
    if (!spend(state, player, "attack", cost)) return;
    clearCamouflageOnFirstAction(attacker);
    consumeAttackTurnBuff(attacker);
    attacker.facing = getFacingFromMovement(attacker.position, target, attacker.facing);
    attacker.attacksUsedThisTurn++;
    attacker.attackUsesThisTurn[attackIndex] = (attacker.attackUsesThisTurn[attackIndex] ?? 0) + 1;
    if (attack.cooldownTurns !== undefined) {
        attacker.attackCooldowns[attackIndex] = attack.cooldownTurns;
    }
    const stats = state.statistics[player];
    stats.attacks++;
    let actualDamage = 0;
    let damageToMonsters = 0;
    let damageToEnemies = 0;
    let damageToAllies = 0;
    let damageToBase = 0;
    let targetsHit = 0;
    let overkillDamage = 0;
    let criticalDamageBonus = 0;
    let healingDone = 0;
    let healingWaste = 0;
    let effectsCleared = 0;
    let buffsApplied = 0;
    let cooldownReductionUsed = 0;
    let camouflageTriggered = false;
    let camouflageSuppressed = false;
    let actionTarget = "case vide";
    let supportEffect = "";

    if (attack.targetsAlliesOnly && targetMonster?.owner === player) {
        actionTarget = `${targetMonster.monster.name} (J${player})`;
        if (attack.healAmount !== undefined) {
            const { healed, clearedEffects } = healMonster(
                targetMonster,
                attack.healAmount,
                attack.clearsStatusEffects,
            );
            healingDone = healed;
            healingWaste = attack.healAmount - healed;
            effectsCleared = clearedEffects;
            supportEffect = `soigne ${healed} PV${clearedEffects ? " et dissipe les effets" : ""}`;
        } else if (attack.cooldownReduction !== undefined) {
            const effectsBeforeCleanup = targetMonster.statusEffects.length;
            if (attack.clearsStatusEffects) clearStatusEffects(targetMonster);
            effectsCleared = effectsBeforeCleanup;
            targetMonster.attackCooldowns = targetMonster.attackCooldowns.map((cooldown) =>
                Math.max(0, cooldown - attack.cooldownReduction!),
            );
            cooldownReductionUsed = attack.cooldownReduction;
            supportEffect = "réduit les recharges";
        } else {
            applyMonsterTurnBuff(targetMonster, attack);
            buffsApplied = 1;
            supportEffect = "applique un bonus temporaire";
        }
    } else if (isAreaAttack(attack)) {
        if (attack.movesToZone) {
            const landing = getJumpLanding(state, board, attacker, cells);
            if (landing) {
                attacker.facing = getFacingFromMovement(
                    attacker.position,
                    landing,
                    attacker.facing,
                );
                attacker.position = landing;
            }
        }
        const enemyStart = getStartingPositions(board)[opposingPlayer(player)];
        for (const victim of state.monsters) {
            const inZone = cells.some(
                (cell) => cell.x === victim.position.x && cell.y === victim.position.y,
            );
            if (
                victim.currentHp <= 0 ||
                victim.id === attacker.id ||
                !inZone ||
                (!attack.hitsAllies && victim.owner === player) ||
                !canAttackMonster(attacker.monster, attack, victim.monster)
            ) {
                continue;
            }
            const damage = getAttackDamage(attack, attackDamageBonus);
            if (victim.isCamouflaged) {
                victim.isCamouflaged = false;
                camouflageSuppressed = true;
            }
            const damageBeforeHit = victim.currentHp;
            victim.currentHp -= damage;
            actualDamage += damage;
            damageToMonsters += Math.min(damage, damageBeforeHit);
            if (victim.owner === player) {
                damageToAllies += Math.min(damage, damageBeforeHit);
            } else {
                damageToEnemies += Math.min(damage, damageBeforeHit);
            }
            overkillDamage += Math.max(0, damage - damageBeforeHit);
            targetsHit++;
            stats.damageDealt += damage;
            state.statistics[victim.owner].damageReceived += damage;
            applyStatusEffect(victim, attack.statusEffect, attacker);
            actionTarget = `${victim.monster.name} (J${victim.owner})`;
            if (victim.currentHp <= 0 && victim.owner !== player) {
                stats.monstersKilled++;
                state.statistics[victim.owner].monstersLost++;
                actionTarget += " éliminé";
                if (attacker.monster.id === "thief") {
                    attacker.isCamouflaged = true;
                    camouflageTriggered = true;
                }
            }
        }
        if (
            canAttackBaseThisTurn(
                attacker.summonedOnTurn,
                state.turn,
                state.allowBaseAttackOnSummonTurn,
            ) &&
            cells.some((cell) => cell.x === enemyStart.x && cell.y === enemyStart.y)
        ) {
            damageBase(state, player);
            actionTarget = `base J${opposingPlayer(player)}`;
            actualDamage++;
            damageToBase = 1;
        }
    } else if (targetMonster && targetMonster.owner !== player) {
        const backstab =
            (attacker.monster.bonusDamageFromBehind ?? 0) > 0 &&
            isBehind(targetMonster.position, attacker.position, targetMonster.facing);
        criticalDamageBonus = backstab ? (attacker.monster.bonusDamageFromBehind ?? 0) : 0;
        const damage = getAttackDamage(attack, attackDamageBonus) + criticalDamageBonus;
        const damageBeforeHit = targetMonster.currentHp;
        if (targetMonster.isCamouflaged) {
            targetMonster.isCamouflaged = false;
            camouflageSuppressed = true;
        }
        targetMonster.currentHp -= damage;
        actualDamage = damage;
        damageToMonsters = Math.min(damage, damageBeforeHit);
        damageToEnemies = Math.min(damage, damageBeforeHit);
        overkillDamage = Math.max(0, damage - damageBeforeHit);
        targetsHit = 1;
        stats.damageDealt += damage;
        state.statistics[targetMonster.owner].damageReceived += damage;
        actionTarget = `${targetMonster.monster.name} (J${targetMonster.owner})`;
        applyStatusEffect(targetMonster, attack.statusEffect, attacker);
        if (targetMonster.currentHp <= 0) {
            stats.monstersKilled++;
            state.statistics[targetMonster.owner].monstersLost++;
            actionTarget += " éliminé";
            if (attacker.monster.id === "thief") {
                attacker.isCamouflaged = true;
                camouflageTriggered = true;
            }
        }
    } else {
        const enemyStart = getStartingPositions(board)[opposingPlayer(player)];
        if (
            target.x === enemyStart.x &&
            target.y === enemyStart.y &&
            canAttackBaseThisTurn(
                attacker.summonedOnTurn,
                state.turn,
                state.allowBaseAttackOnSummonTurn,
            )
        ) {
            damageBase(state, player);
            actionTarget = `base J${opposingPlayer(player)}`;
            actualDamage = 1;
            damageToBase = 1;
        }
    }

    const actionDescription = supportEffect
        ? `${attacker.monster.name} ${supportEffect} sur ${actionTarget}.`
        : `${attacker.monster.name} utilise « ${attack.name} » sur ${actionTarget}` +
          `${actualDamage ? ` (${actualDamage} dégât(s))` : ""}.`;
    if (actualDamage === 0 && !supportEffect) {
        stats.ineffectiveActions++;
    }
    addEvent(state, {
        turn: state.turn,
        player,
        type: "strategy",
        description: `Priorité d'action : score tactique ${choice.score}.`,
        monsterId: attacker.id,
        monsterTypeId: attacker.monster.id,
        monsterName: attacker.monster.name,
        target: actionTarget,
        ...(state.debug
            ? {
                  debug: {
                      situation: `base J${player}=${state.health[player]}, base adverse=${state.health[opposingPlayer(player)]}`,
                      candidates: 1,
                      depth: 1,
                      positionsExplored: state.monsters.length,
                      selectedAction: actionDescription,
                  },
              }
            : {}),
    });
    addEvent(state, {
        turn: state.turn,
        player,
        type: "attack",
        description: actionDescription,
        monsterId: attacker.id,
        monsterTypeId: attacker.monster.id,
        monsterName: attacker.monster.name,
        attackName: attack.name,
        target: actionTarget,
        cost,
        damage: actualDamage,
        targetsHit,
        damageToMonsters,
        damageToEnemies,
        damageToAllies,
        damageToBase,
        overkillDamage,
        criticalDamageBonus,
        healingDone,
        healingWaste,
        effectsCleared,
        buffsApplied,
        cooldownReductionUsed,
        ...(camouflageTriggered ? { camouflageTriggered: true } : {}),
        ...(camouflageSuppressed ? { camouflageSuppressed: true } : {}),
        to: target,
    });
    state.winner ??= getMonsterEliminationWinner(state.monsters, state.monstersKilledForVictory);
    if (state.winner !== null && state.finishReason !== "baseDestroyed") {
        state.finishReason = "monstersEliminated";
    }
}

export function performAttacks(state: MatchState, board: BoardDefinition): void {
    while (state.winner === null) {
        const choice = chooseAttack(state, board);
        if (!choice) return;
        executeAttack(state, board, choice);
    }
}

export function beginTurn(
    state: MatchState,
    configuration: GameConfiguration,
    player: PlayerId,
): void {
    state.currentPlayer = player;
    for (const monster of getPlayerMonsters(state, player)) {
        const healthBefore = monster.currentHp;
        const source = monster.statusEffects.find(
            (effect) => effect.type === "damageOverTime" && effect.source,
        )?.source;
        const damage = applyStatusEffectsAtTurnStart(monster);
        if (damage > 0) {
            const actualDamage = Math.min(damage, healthBefore);
            state.statistics[player].damageReceived += actualDamage;
            if (source) state.statistics[source.owner].damageDealt += actualDamage;
            addEvent(state, {
                turn: state.turn,
                player: source?.owner ?? player,
                type: "status",
                description: source
                    ? `${source.name} inflige ${actualDamage} dégât(s) de poison à ${monster.monster.name} (J${player}).`
                    : `${monster.monster.name} subit ${actualDamage} dégât(s) d'effet de statut.`,
                ...(source
                    ? {
                          monsterId: source.id,
                          monsterTypeId: source.monsterId,
                          monsterName: source.name,
                      }
                    : {}),
                target: `${monster.monster.name} (J${player})`,
                damage: actualDamage,
            });
        }
        monster.attacksUsedThisTurn = 0;
        monster.attackUsesThisTurn = getInitialAttackUses(monster.monster);
        monster.movementsUsedThisTurn = 0;
        monster.attackCooldowns = monster.attackCooldowns.map((cooldown) =>
            Math.max(0, cooldown - 1),
        );
    }
    state.winner ??= getMonsterEliminationWinner(
        state.monsters,
        configuration.monstersKilledForVictory,
    );
    if (state.winner !== null) state.finishReason = "monstersEliminated";
    addEvent(state, {
        turn: state.turn,
        player,
        type: "turn",
        description: `Début du tour ${state.turn}.`,
    });
}

export function finishPlayerTurn(state: MatchState, player: PlayerId): void {
    for (const monster of state.monsters) {
        if (monster.owner === player) clearMonsterTurnBuff(monster);
    }
    addEvent(state, {
        turn: state.turn,
        player,
        type: "turnEnd",
        description: `Fin du tour ${state.turn}.`,
    });
}
