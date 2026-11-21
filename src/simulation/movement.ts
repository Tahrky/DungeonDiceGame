import {
    canPassHostileMonsters,
    canUseActionThisTurn,
    consumeMovementTurnBuff,
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
    const strategicSnapshot: StrategicSnapshot = {
        board,
        health: { ...state.health },
        initialHealth: Math.max(state.health[1], state.health[2], 1),
        monsters: state.monsters,
        reserves: {
            1: { ...state.reserves[1] },
            2: { ...state.reserves[2] },
        },
        profile: state.profiles[player],
        tactics: { ...state.tactics },
        currentPlayer: player,
        turn: state.turn,
    };
    const roles = new Map(
        assignMonsterRoles(strategicSnapshot, player).map((assignment) => [
            assignment.monsterId,
            assignment,
        ]),
    );

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
            const enemyPositions = state.monsters
                .filter((placed) => placed.owner !== player && placed.currentHp > 0)
                .map((placed) => placed.position);
            const role =
                state.tactics[player] === "defense"
                    ? assignMonsterRoles(strategicSnapshot, player).find(
                          (assignment) => assignment.monsterId === monster.id,
                      )
                    : roles.get(monster.id);
            const roleObjective =
                role?.target ??
                chooseBotObjective(
                    state.tactics[player],
                    monster.position,
                    enemyStart,
                    enemyPositions,
                    starts[player],
                );
            const best = findObjectiveMovement(
                movement,
                ownedCells,
                roleObjective,
                enemyPositions,
                state.tactics[player],
                createThreatScores(board, state.monsters, monster.id),
                state.strategyWeights?.[player] ?? DEFAULT_BOT_STRATEGY_WEIGHTS,
            );
            if (!best || !spend(state, player, "movement", cost)) break;

            consumeMovementTurnBuff(monster);
            const from = monster.position;
            const movementGoal =
                role?.role === "defense"
                    ? "le périmètre de sa base"
                    : role?.role === "hunt" ||
                        (state.tactics[player] === "hunt" && enemyPositions.length > 0)
                      ? "les monstres adverses"
                      : "le départ ennemi";
            monster.facing = getFacingFromMovement(from, best.position, monster.facing);
            monster.position = best.position;
            monster.movementsUsedThisTurn++;
            state.statistics[player].movements++;
            if (!state.lightResults) {
                addEvent(state, {
                    turn: state.turn,
                    player,
                    type: "strategy",
                    description: `Suit le chemin vers ${movementGoal} : ${best.routeProgress} case(s) plus près.`,
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
