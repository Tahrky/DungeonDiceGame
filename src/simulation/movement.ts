import {
    canUseActionThisTurn,
    consumeMovementTurnBuff,
    clearCamouflageForMovement,
    getMovementActionsPerTurn,
    getMovementCost,
} from "../game/monsterActions";
import {
    getFacingFromMovement,
    getGridDistance,
    isSamePosition,
    positionKey,
} from "../game/geometry";
import { createObjectivePlanner } from "../game/botMovement";
import { getStartingPositions, type BoardDefinition } from "../game/boards";
import { opposingPlayer } from "../game/matchRules";
import type { PlacedMonster, PlayerId, Position } from "../types/GameTypes";
import {
    addEvent,
    canSpend,
    cloneMatchState,
    createStrategicSnapshot,
    getPlayerMonsters,
    spend,
    type MatchState,
} from "./matchState";
import {
    chooseBotObjective,
    choosesRandomActions,
    DEFAULT_BOT_STRATEGY_WEIGHTS,
    type BotStrategyWeights,
    type ObjectiveMovement,
} from "../game/botStrategy";
import { shuffle } from "../game/random";
import {
    assignMonsterRoles,
    createThreatScores,
    type RoleAssignment,
    type StrategicSnapshot,
} from "../game/ai";
import { findAttackSetupMovement } from "./attackSetupMovement";
import { performAttacks } from "./combat";
import { getAvailableAttackChoices } from "./combat/attackChoices";
import { createFormationScorer } from "../game/formation";
import { createMovementOptions } from "./movementOptions";
import { getPlacementReplyPenalty } from "./placementReply";

type FormationScorer = ReturnType<typeof createFormationScorer>;
type MovementStep = "moved" | "stopped" | "matchOver";

interface MovementContext {
    readonly state: MatchState;
    readonly board: BoardDefinition;
    readonly player: PlayerId;
    readonly starts: Record<PlayerId, Position>;
    readonly ownMonsterCount: number;
    readonly snapshot: StrategicSnapshot;
    readonly weights: Readonly<BotStrategyWeights>;
}

const MOVEMENT_GOALS: Partial<Record<RoleAssignment["role"], string>> = {
    defend: "le périmètre de sa base",
    intercept: "une route d’interception",
    support: "ses alliés",
    patrol: "son secteur de patrouille",
};
const DEFAULT_MOVEMENT_GOAL = "le départ ennemi";
const ATTACK_SETUP_DESCRIPTION = "Se déplace pour créer une attaque ce tour-ci.";

function chooseObjectives(
    context: MovementContext,
    monster: PlacedMonster,
    role: RoleAssignment | undefined,
    enemyPositions: readonly Position[],
): { roleObjective: Position; objectives: Position[] } {
    const { state, player, starts } = context;
    const enemyStart = starts[opposingPlayer(player)];
    const roleObjective =
        (role?.role === "advance" ? enemyStart : role?.target) ??
        chooseBotObjective(
            state.tactics[player],
            monster.position,
            enemyStart,
            enemyPositions,
            starts[player],
        );
    const nearestEnemies = [...enemyPositions].sort(
        (first, second) =>
            getGridDistance(first, monster.position) - getGridDistance(second, monster.position),
    );
    const orderedObjectives = [
        roleObjective,
        ...[enemyStart, ...nearestEnemies].filter(
            (objective) => !isSamePosition(objective, roleObjective),
        ),
    ];
    const objectives = choosesRandomActions(state.profiles[player])
        ? shuffle(orderedObjectives, state.actionRandom?.[player])
        : orderedObjectives;
    return { roleObjective, objectives };
}

function isGuardingGate(
    context: MovementContext,
    formation: FormationScorer,
    monster: PlacedMonster,
    enemyPositions: readonly Position[],
): boolean {
    const { state, player, starts } = context;
    return (
        state.tactics[player] === "defense" &&
        context.ownMonsterCount > 1 &&
        formation.guardsLastEntrance(monster.position) &&
        enemyPositions.some((enemy) => getGridDistance(enemy, starts[player]) <= 5)
    );
}

function createMovementThreatScores(
    context: MovementContext,
    formation: FormationScorer,
    monster: PlacedMonster,
    deployedCells: readonly Position[],
): Map<string, number> {
    const threatScores = new Map(
        createThreatScores(context.board, context.state.monsters, monster.id, true),
    );
    if (!formation.hasBackstabThreat) return threatScores;
    for (const position of deployedCells) {
        const key = positionKey(position);
        // Overlapping footprints describe a single landing square.
        threatScores.set(
            key,
            Math.max(threatScores.get(key) ?? 0, formation.flankRisk(monster, position)),
        );
    }
    return threatScores;
}

function recordStagnation(state: MatchState, player: PlayerId, monsterId: string): void {
    const statistics = state.statistics[player];
    statistics.stagnantMonsterTurns++;
    state.movementStagnation[monsterId] = (state.movementStagnation[monsterId] ?? 0) + 1;
    statistics.actionsSkippedByReason.unreachableObjective =
        (statistics.actionsSkippedByReason.unreachableObjective ?? 0) + 1;
}

function opensGuardedThreat(
    context: MovementContext,
    monster: PlacedMonster,
    movement: ObjectiveMovement,
    attacksAfterMovement: boolean,
): boolean {
    const before = getPlacementReplyPenalty(context.state, context.board, context.player);
    const candidate = cloneMatchState(context.state);
    const guard = candidate.monsters.find(({ id }) => id === monster.id);
    if (!guard) throw new Error(`Garde introuvable : ${monster.id}`);
    guard.facing = getFacingFromMovement(guard.position, movement.position, guard.facing);
    guard.position = movement.position;
    clearCamouflageForMovement(guard, movement.path);
    consumeMovementTurnBuff(guard);
    if (attacksAfterMovement && !choosesRandomActions(candidate.profiles[context.player])) {
        const bestAttack = getAvailableAttackChoices(candidate, context.board, undefined, false)[0];
        if (
            bestAttack &&
            bestAttack.features.baseDamage >= candidate.health[opposingPlayer(context.player)]
        ) {
            return false;
        }
    }
    return getPlacementReplyPenalty(candidate, context.board, context.player) > before;
}

function recordGuardDecision(state: MatchState, player: PlayerId, monsterId: string): void {
    addEvent(state, {
        turn: state.turn,
        player,
        type: "strategy",
        monsterId,
        description: "Garde l’entrée de sa base plutôt que d’ouvrir le passage.",
    });
}

function describeObjectiveMovement(
    role: RoleAssignment | undefined,
    reEvaluated: boolean,
    movement: ObjectiveMovement,
): string {
    const goal = (role && MOVEMENT_GOALS[role.role]) ?? DEFAULT_MOVEMENT_GOAL;
    const prefix = reEvaluated ? "Réévalue son objectif ; " : "";
    return `${prefix}suit le chemin vers ${goal} : ${movement.routeProgress} case(s) plus près.`;
}

function applyMovement(
    state: MatchState,
    player: PlayerId,
    monster: PlacedMonster,
    movement: ObjectiveMovement,
    cost: number,
    description: string,
): void {
    consumeMovementTurnBuff(monster);
    clearCamouflageForMovement(monster, movement.path);
    const from = monster.position;
    monster.facing = getFacingFromMovement(from, movement.position, monster.facing);
    monster.position = movement.position;
    monster.movementsUsedThisTurn++;
    state.movementStagnation[monster.id] = 0;
    state.statistics[player].movements++;
    const subject = {
        monsterId: monster.id,
        monsterTypeId: monster.monster.id,
        monsterName: monster.monster.name,
    };
    addEvent(state, { turn: state.turn, player, type: "strategy", description, ...subject });
    addEvent(state, {
        turn: state.turn,
        player,
        type: "movement",
        description: `${monster.monster.name} se déplace de ${movement.path.length - 1} case(s).`,
        ...subject,
        from,
        to: movement.position,
        cost,
    });
}

function moveMonster(context: MovementContext, monster: PlacedMonster, cost: number): MovementStep {
    const { state, board, player, starts } = context;
    const movement = createMovementOptions(state, board, monster);
    const enemyPositions = movement.hostileCells ?? [];
    const role = assignMonsterRoles(context.snapshot, player).find(
        (assignment) => assignment.monsterId === monster.id,
    );
    const { roleObjective, objectives } = chooseObjectives(context, monster, role, enemyPositions);
    const formation = createFormationScorer(board, state.monsters, player, starts[player]);
    const guardingGate = isGuardingGate(context, formation, monster, enemyPositions);
    if (guardingGate && !state.movementAttackCombos) {
        recordGuardDecision(state, player, monster.id);
        return "stopped";
    }
    const planner = createObjectivePlanner(
        movement,
        enemyPositions,
        state.tactics[player],
        createMovementThreatScores(context, formation, monster, movement.deployedCells),
        context.weights,
    );
    let best = planner.toward(objectives[0]!);
    let selectedObjective = objectives[0]!;
    const onGuard =
        role?.role === "defend" && !!role.target && isSamePosition(role.target, monster.position);
    if (!best && !onGuard) {
        for (const objective of objectives.slice(1)) {
            best = planner.toward(objective);
            if (best) {
                selectedObjective = objective;
                break;
            }
        }
        state.statistics[player].unreachableObjectives++;
    }
    const trySetup =
        state.movementAttackCombos ||
        (!best && !onGuard && planner.paths.size > 0 && monster.attacksUsedThisTurn === 0);
    const attackSetupMovement = trySetup
        ? findAttackSetupMovement(state, board, monster, planner.paths, best, roleObjective)
        : null;
    const selectedMovement = attackSetupMovement ?? best;
    if (!selectedMovement) {
        if (guardingGate) recordGuardDecision(state, player, monster.id);
        else if (!onGuard) recordStagnation(state, player, monster.id);
        return "stopped";
    }
    if (
        guardingGate &&
        opensGuardedThreat(context, monster, selectedMovement, !!attackSetupMovement)
    ) {
        recordGuardDecision(state, player, monster.id);
        return "stopped";
    }
    if (!spend(state, player, "movement", cost)) return "stopped";

    const description = attackSetupMovement
        ? ATTACK_SETUP_DESCRIPTION
        : describeObjectiveMovement(
              role,
              !isSamePosition(selectedObjective, roleObjective),
              selectedMovement,
          );
    applyMovement(state, player, monster, selectedMovement, cost, description);
    if (!attackSetupMovement || !state.movementAttackCombos) return "moved";
    performAttacks(state, board);
    return state.winner === null ? "stopped" : "matchOver";
}

export function performMovements(state: MatchState, board: BoardDefinition): void {
    if (state.winner !== null) return;

    const player = state.currentPlayer;
    const ownMonsters = getPlayerMonsters(state, player);
    const context: MovementContext = {
        state,
        board,
        player,
        starts: getStartingPositions(board),
        ownMonsterCount: ownMonsters.length,
        snapshot: createStrategicSnapshot(state, board, player),
        weights: state.strategyWeights?.[player] ?? DEFAULT_BOT_STRATEGY_WEIGHTS,
    };

    // Shared dice: don't let the first summoned unit consume movement every round.
    for (let index = 0; index < ownMonsters.length; index++) {
        const monster = ownMonsters[(index + state.turn - 1) % ownMonsters.length]!;
        if (monster.currentHp <= 0) continue;
        while (
            canUseActionThisTurn(
                monster.movementsUsedThisTurn,
                getMovementActionsPerTurn(monster.monster),
            )
        ) {
            const cost = getMovementCost(
                monster.monster,
                monster.turnBuffs?.movementCostReduction ?? 0,
            );
            if (!canSpend(state, player, "movement", cost)) break;

            const step = moveMonster(context, monster, cost);
            if (step === "matchOver") return;
            if (step === "stopped") break;
        }
    }
}
