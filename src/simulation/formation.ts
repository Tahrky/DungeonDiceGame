import type { BoardDefinition } from "../game/boards";
import { getFacingFromMovement, getGridDistance } from "../game/monsterActions";
import type { Facing, PlacedMonster, PlayerId, Position } from "../types/GameTypes";

const behind: Record<Facing, Position> = {
    east: { x: -1, y: 0 },
    west: { x: 1, y: 0 },
    north: { x: 0, y: 1 },
    south: { x: 0, y: -1 },
};

export function createFormationScorer(
    board: BoardDefinition,
    monsters: readonly PlacedMonster[],
    player: PlayerId,
    base: Position,
) {
    const index = ({ x, y }: Position) =>
        x >= 0 && y >= 0 && x < board.width && y < board.height ? y * board.width + x : -1;
    const rearIndex = (cell: Position, facing: Facing) =>
        index({ x: cell.x + behind[facing].x, y: cell.y + behind[facing].y });
    const facing = player === 1 ? "east" : "west";
    const territory = new Uint8Array(board.width * board.height);
    const occupied = new Uint8Array(territory.length);
    const entrances = [
        { x: base.x - 1, y: base.y },
        { x: base.x + 1, y: base.y },
        { x: base.x, y: base.y - 1 },
        { x: base.x, y: base.y + 1 },
    ]
        .map(index)
        .filter((i) => i >= 0);
    const alliedRears = new Set<number>();
    const thieves: PlacedMonster[] = [];
    for (const monster of monsters) {
        for (const cell of monster.cells) territory[index(cell)] = monster.owner;
        if (monster.currentHp <= 0) continue;
        occupied[index(monster.position)] = monster.owner;
        if (monster.owner === player) alliedRears.add(rearIndex(monster.position, monster.facing));
        else if ((monster.monster.bonusDamageFromBehind ?? 0) > 0) thieves.push(monster);
    }

    function footprint(cells: readonly Position[]): number {
        let score = 0;
        for (const cell of cells) {
            const i = index(cell);
            if (territory[i]) continue;
            const distance = getGridDistance(cell, base);
            // Claim lateral deployment space, without paving additional entrances next to the base.
            if (distance === 1) score -= 18;
            if (distance >= 2 && distance <= 4 && cell.y !== base.y) score += 10;
            if (thieves.length && alliedRears.has(i)) score -= 32;
        }
        return score;
    }

    function spawn(position: Position, cells: readonly Position[]): number {
        const rear = rearIndex(position, facing);
        const protectedRear =
            occupied[rear] === player ||
            (!territory[rear] && !cells.some((cell) => index(cell) === rear));
        const guardsEntrance =
            getGridDistance(position, base) === 1 &&
            entrances.every(
                (i) =>
                    i === index(position) ||
                    occupied[i] === player ||
                    (!territory[i] && !cells.some((cell) => index(cell) === i)),
            );
        return (
            (guardsEntrance ? 85 : 0) +
            (protectedRear ? (thieves.length ? 40 : 12) : 0) -
            Math.abs(getGridDistance(position, base) - 3) * 4
        );
    }

    function flankRisk(monster: PlacedMonster, destination: Position): number {
        const direction = getFacingFromMovement(monster.position, destination, monster.facing);
        const rear = rearIndex(destination, direction);
        if (!territory[rear] || (occupied[rear] === player && rear !== index(monster.position)))
            return 0;
        const cell = { x: rear % board.width, y: Math.floor(rear / board.width) };
        return thieves.reduce((risk, thief) => {
            const reach =
                (thief.monster.movementRange ?? 2) * (thief.monster.movementActionsPerTurn ?? 1);
            return getGridDistance(thief.position, cell) <= reach
                ? Math.max(risk, thief.monster.bonusDamageFromBehind ?? 0)
                : risk;
        }, 0);
    }
    const guardsLastEntrance = (position: Position) =>
        getGridDistance(position, base) === 1 &&
        entrances.every((i) => !territory[i] || occupied[i] === player);
    return {
        footprint,
        spawn,
        flankRisk,
        guardsLastEntrance,
        hasBackstabThreat: thieves.length > 0,
    };
}
