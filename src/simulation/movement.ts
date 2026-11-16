import {
    canPassHostileMonsters,
    canUseActionThisTurn,
    getFacingFromMovement,
    getMovementActionsPerTurn,
    getMovementCost,
    getMovementRange,
    type MovementOptions,
} from "../game/monsterActions";
import {
    getStartingPositions,
    type BoardDefinition,
} from "../game/boards";
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

export function performMovements(state: MatchState, board: BoardDefinition): void {
    if (state.winner !== null) return;

    for (const monster of getPlayerMonsters(state, state.currentPlayer)) {
        while (
            canUseActionThisTurn(
                monster.movementsUsedThisTurn,
                getMovementActionsPerTurn(monster.monster),
            )
        ) {
            const player = state.currentPlayer;
            const cost = getMovementCost(
                monster.monster,
                monster.turnBuffs?.movementCostReduction ?? 0,
            );
            if (!canSpend(state, player, "movement", cost)) break;

            const enemyStart = getStartingPositions(board)[opposingPlayer(player)];
            const movement: MovementOptions = {
                ...createMovementOptions(state, board, monster),
                destination: monster.position,
            };
            const ownedCells = state.monsters
                .filter((placed) => placed.owner === player)
                .flatMap((placed) => placed.cells);
            const enemyPositions = state.monsters
                .filter((placed) => placed.owner !== player && placed.currentHp > 0)
                .map((placed) => placed.position);
            const best = findObjectiveMovement(
                movement,
                ownedCells,
                chooseBotObjective(
                    state.profiles[player],
                    monster.position,
                    enemyStart,
                    enemyPositions,
                ),
                enemyPositions,
            );
            if (!best || !spend(state, player, "movement", cost)) break;

            const from = monster.position;
            const movementGoal =
                state.profiles[player] === "defensive" && enemyPositions.length > 0
                    ? "les monstres adverses"
                    : "le départ ennemi";
            monster.facing = getFacingFromMovement(from, best.position, monster.facing);
            monster.position = best.position;
            monster.movementsUsedThisTurn++;
            state.statistics[player].movements++;
            addEvent(
                state,
                player,
                "strategy",
                `Suit le chemin vers ${movementGoal} : ${best.routeProgress} case(s) plus près.`,
                {
                    monsterId: monster.id,
                    monsterTypeId: monster.monster.id,
                    monsterName: monster.monster.name,
                },
            );
            addEvent(
                state,
                player,
                "movement",
                `${monster.monster.name} se déplace de ${best.path.length - 1} case(s).`,
                {
                    monsterId: monster.id,
                    monsterTypeId: monster.monster.id,
                    monsterName: monster.monster.name,
                    from,
                    to: best.position,
                    cost,
                },
            );
        }
    }
}

function createMovementOptions(
    state: MatchState,
    board: BoardDefinition,
    monster: PlacedMonster,
) {
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
        range: getMovementRange(
            monster.monster,
            monster.turnBuffs?.movementRangeBonus ?? 0,
        ),
        boardWidth: board.width,
        boardHeight: board.height,
    };
}
