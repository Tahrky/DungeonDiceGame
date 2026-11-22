import {
    canPassHostileMonsters,
    canUseActionThisTurn,
    consumeMovementTurnBuff,
    clearCamouflageOnFirstAction,
    getFacingFromMovement,
    getMovementActionsPerTurn,
    getMovementCost,
    getMovementRange,
    type MovementOptions,
} from "../game/monsterActions";
import { getStartingPositions, type BoardDefinition } from "../game/boards";
import type { PlacedMonster } from "../types/GameTypes";
import {
    addEvent,
    canSpend,
    getPlayerMonsters,
    opposingPlayer,
    spend,
    type MatchState,
} from "./matchState";
import { chooseBotObjective, findObjectiveMovement } from "../game/botStrategy";
import { DEFAULT_BOT_STRATEGY_WEIGHTS } from "../game/botStrategy";
import { assignMonsterRoles, createThreatScores, type StrategicSnapshot } from "../game/ai";

export function performMovements(state: MatchState, board: BoardDefinition): void {
    if (state.winner !== null) return;

    const player = state.currentPlayer;
    const starts = getStartingPositions(board);
    const ownMonsters = getPlayerMonsters(state, player);
    const ownedCells = state.monsters
        .filter((placed) => placed.owner === player)
        .flatMap((placed) => placed.cells);
    const enemyPositions = state.monsters
        .filter((placed) => placed.owner !== player && placed.currentHp > 0)
        .map((placed) => placed.position);
    const strategicSnapshot: StrategicSnapshot = {
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
    const weights = state.strategyWeights?.[player] ?? DEFAULT_BOT_STRATEGY_WEIGHTS;

    for (const monster of ownMonsters) {
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

            const enemyStart = starts[opposingPlayer(player)];
            const movement: MovementOptions = {
                ...createMovementOptions(state, board, monster),
                destination: monster.position,
            };
            const role = assignMonsterRoles(strategicSnapshot, player).find(
                (assignment) => assignment.monsterId === monster.id,
            );
            if (role?.role === "hold") {
                state.statistics[player].actionsSkippedByReason.heldForDefense =
                    (state.statistics[player].actionsSkippedByReason.heldForDefense ?? 0) + 1;
                break;
            }
            const roleObjective =
                role?.target ??
                chooseBotObjective(
                    state.tactics[player],
                    monster.position,
                    enemyStart,
                    enemyPositions,
                    starts[player],
                );
            const alternateObjectives = [
                starts[opposingPlayer(player)],
                ...enemyPositions
                    .slice()
                    .sort(
                        (first, second) =>
                            Math.abs(first.x - monster.position.x) +
                            Math.abs(first.y - monster.position.y) -
                            (Math.abs(second.x - monster.position.x) +
                                Math.abs(second.y - monster.position.y)),
                    ),
            ];
            const objectives = [
                roleObjective,
                ...alternateObjectives.filter(
                    (objective) =>
                        objective.x !== roleObjective.x || objective.y !== roleObjective.y,
                ),
            ];
            const movementGoal =
                role?.role === "defend"
                    ? "le périmètre de sa base"
                    : role?.role === "intercept"
                      ? "une route d’interception"
                      : role?.role === "support"
                        ? "ses alliés"
                        : role?.role === "patrol"
                          ? "son secteur de patrouille"
                          : "le départ ennemi";
            const threatScores = createThreatScores(board, state.monsters, monster.id);
            let best = findObjectiveMovement(
                movement,
                ownedCells,
                objectives[0]!,
                enemyPositions,
                state.tactics[player],
                threatScores,
                weights,
            );
            let selectedObjective = objectives[0]!;
            if (!best) {
                for (const objective of objectives.slice(1)) {
                    best = findObjectiveMovement(
                        movement,
                        ownedCells,
                        objective,
                        enemyPositions,
                        state.tactics[player],
                        threatScores,
                        weights,
                    );
                    if (best) {
                        selectedObjective = objective;
                        break;
                    }
                }
                state.statistics[player].unreachableObjectives++;
            }
            if (!best) {
                state.statistics[player].stagnantMonsterTurns++;
                state.movementStagnation[monster.id] =
                    (state.movementStagnation[monster.id] ?? 0) + 1;
                state.statistics[player].actionsSkippedByReason.unreachableObjective =
                    (state.statistics[player].actionsSkippedByReason.unreachableObjective ?? 0) + 1;
                break;
            }
            if (!spend(state, player, "movement", cost)) break;

            consumeMovementTurnBuff(monster);
            clearCamouflageOnFirstAction(monster);
            const from = monster.position;
            monster.facing = getFacingFromMovement(from, best.position, monster.facing);
            monster.position = best.position;
            monster.movementsUsedThisTurn++;
            state.movementStagnation[monster.id] = 0;
            state.statistics[player].movements++;
            const reEvaluated =
                selectedObjective.x !== roleObjective.x ||
                selectedObjective.y !== roleObjective.y;
            addEvent(state, {
                turn: state.turn,
                player,
                type: "strategy",
                description: `${reEvaluated ? "Réévalue son objectif ; " : ""}suit le chemin vers ${movementGoal} : ${best.routeProgress} case(s) plus près.`,
                monsterId: monster.id,
                monsterTypeId: monster.monster.id,
                monsterName: monster.monster.name,
            });
            addEvent(state, {
                turn: state.turn,
                player,
                type: "movement",
                description: `${monster.monster.name} se déplace de ${best.path.length - 1} case(s).`,
                monsterId: monster.id,
                monsterTypeId: monster.monster.id,
                monsterName: monster.monster.name,
                from,
                to: best.position,
                cost,
            });
        }
    }
}

function createMovementOptions(state: MatchState, board: BoardDefinition, monster: PlacedMonster) {
    return {
        source: monster.position,
        deployedCells: state.monsters.flatMap((placed) => placed.cells),
        occupiedCells: state.monsters
            .filter((placed) => placed.currentHp > 0 && placed.id !== monster.id)
            .map((placed) => placed.position),
        blockedCells: [...board.blockedCells, ...Object.values(getStartingPositions(board))],
        hostileCells: state.monsters
            .filter((placed) => placed.currentHp > 0 && placed.owner !== monster.owner)
            .map((placed) => placed.position),
        canPassHostiles: canPassHostileMonsters(monster.monster),
        canPassUndeployedCells: monster.monster.flying === true,
        range: getMovementRange(monster.monster, monster.turnBuffs?.movementRangeBonus ?? 0),
        boardWidth: board.width,
        boardHeight: board.height,
    };
}
