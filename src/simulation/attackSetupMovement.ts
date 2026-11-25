import type { BoardDefinition } from "../game/boards";
import type { ObjectiveMovement } from "../game/botStrategy";
import { getFacingFromMovement } from "../game/geometry";
import { selectAttackSetupMovement } from "../game/attackSetupMovement";
import { clearCamouflageForMovement, consumeMovementTurnBuff } from "../game/monsterActions";
import type { PlacedMonster, Position } from "../types/GameTypes";
import { getBestAvailableAttackScore } from "./combat";
import { cloneMatchState, type MatchState } from "./matchState";

export function findAttackSetupMovement(
    state: MatchState,
    board: BoardDefinition,
    monster: PlacedMonster,
    paths: ReadonlyMap<string, Position[]>,
    strategicMovement: ObjectiveMovement | null,
    objective: Position,
): ObjectiveMovement | null {
    return selectAttackSetupMovement(
        paths,
        strategicMovement,
        objective,
        getBestAvailableAttackScore(state, board, monster.id),
        (path) => {
            const candidate = cloneMatchState(state);
            const candidateMonster = candidate.monsters.find(({ id }) => id === monster.id);
            if (!candidateMonster) {
                throw new Error(`Monstre introuvable dans la simulation : ${monster.id}`);
            }
            const destination = path[path.length - 1]!;
            candidateMonster.facing = getFacingFromMovement(
                candidateMonster.position,
                destination,
                candidateMonster.facing,
            );
            candidateMonster.position = destination;
            clearCamouflageForMovement(candidateMonster, path);
            consumeMovementTurnBuff(candidateMonster);

            return getBestAvailableAttackScore(candidate, board, monster.id);
        },
    );
}
