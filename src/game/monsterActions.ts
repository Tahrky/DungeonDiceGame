import type { AttackPattern, Facing, Monster, MonsterAttack, Position } from "../types/GameTypes";

const FACING_VECTORS: Record<Facing, Position> = {
    north: { x: 0, y: -1 },
    east: { x: 1, y: 0 },
    south: { x: 0, y: 1 },
    west: { x: -1, y: 0 },
};

export interface MovementOptions {
    readonly source: Position;
    readonly destination: Position;
    readonly deployedCells: readonly Position[];
    readonly occupiedCells: readonly Position[];
    readonly blockedCells: readonly Position[];
    range?: number;
    readonly hostileCells?: readonly Position[];
    readonly canPassHostiles?: boolean;
    boardSize?: number;
}

export interface AttackZoneOption {
    readonly target: Position;
    readonly cells: Position[];
}

interface TraversalContext {
    visited: ReadonlyMap<string, number>;
    blockedKeys: ReadonlySet<string>;
    deployedCells: readonly Position[];
    hostileKeys: ReadonlySet<string>;
    canPassHostiles: boolean;
    boardSize: number;
}

export function getGridDistance(first: Position, second: Position): number {
    return Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
}

export function getMovementCost(monster: Pick<Monster, "movementCost">): number {
    return monster.movementCost ?? 1;
}

export function getMovementActionsPerTurn(
    monster: Pick<Monster, "movementActionsPerTurn">,
): number {
    return monster.movementActionsPerTurn ?? 1;
}

export function canUseActionThisTurn(actionsUsed: number, actionLimit: number): boolean {
    return actionsUsed < actionLimit;
}

export function advanceAttackCooldowns(cooldowns: readonly number[]): number[] {
    return cooldowns.map((cooldown) => Math.max(0, cooldown - 1));
}

export function getAttackZones(
    attacker: Position,
    facing: Facing,
    pattern: AttackPattern,
): Position[][] {
    if (pattern.type === "directionalArea") {
        return getDirectionalAreaOptions(attacker, pattern).map((option) => option.cells);
    }

    switch (pattern.type) {
        case "adjacent":
            return getAdjacentAttackZones(attacker);
        case "line":
            return getLineAttackZones(attacker, facing, pattern);
        case "radius":
            return getRadiusAttackZones(attacker, pattern.range);
        case "jumpArea":
            return getJumpAttackZones(attacker, pattern);
        case "area":
            return getAreaAttackZones(attacker, facing, pattern);
    }
}

export function getAttackZoneOptions(
    attacker: Position,
    facing: Facing,
    pattern: AttackPattern,
): AttackZoneOption[] {
    if (pattern.type === "directionalArea") {
        return getDirectionalAreaOptions(attacker, pattern);
    }

    return getAttackZones(attacker, facing, pattern).flatMap((cells) => {
        const targetCells =
            pattern.type === "jumpArea" ||
            (pattern.type === "line" && (pattern.length ?? 1) > 1)
                ? [cells[0]]
                : cells;
        return targetCells.map((target) => ({ target, cells }));
    });
}

function getDirectionalAreaOptions(
    attacker: Position,
    pattern: Extract<AttackPattern, { type: "directionalArea" }>,
): AttackZoneOption[] {
    return (Object.entries(FACING_VECTORS) as [Facing, Position][]).map(([, direction]) => {
        const lateral = { x: -direction.y, y: direction.x };
        const target = { x: attacker.x + direction.x, y: attacker.y + direction.y };
        const cells = Array.from({ length: pattern.depth }, (_, depth) =>
            Array.from({ length: pattern.width }, (_, width) => ({
                x:
                    attacker.x +
                    direction.x * (depth + 1) +
                    lateral.x * (width - Math.floor(pattern.width / 2)),
                y:
                    attacker.y +
                    direction.y * (depth + 1) +
                    lateral.y * (width - Math.floor(pattern.width / 2)),
            })),
        ).flat();
        return { target, cells };
    });
}

function getAdjacentAttackZones(attacker: Position): Position[][] {
    return [
        [{ x: attacker.x, y: attacker.y - 1 }],
        [{ x: attacker.x + 1, y: attacker.y }],
        [{ x: attacker.x, y: attacker.y + 1 }],
        [{ x: attacker.x - 1, y: attacker.y }],
    ];
}

function getLineAttackZones(
    attacker: Position,
    facing: Facing,
    pattern: Extract<AttackPattern, { type: "line" }>,
): Position[][] {
    const directions = pattern.allDirections
        ? Object.values(FACING_VECTORS)
        : [FACING_VECTORS[facing]];
    const length = pattern.length ?? 1;
    const minRange = pattern.minRange ?? 1;
    return directions.flatMap((direction) =>
        Array.from({ length: Math.max(0, pattern.range - minRange + 1) }, (_, index) => {
            const startDistance = minRange + index;
            return Array.from({ length }, (_unused, cellIndex) => ({
                x: attacker.x + direction.x * (startDistance + cellIndex),
                y: attacker.y + direction.y * (startDistance + cellIndex),
            }));
        }),
    );
}

function getRadiusAttackZones(attacker: Position, range: number): Position[][] {
    const cells: Position[] = [];
    for (let y = attacker.y - range; y <= attacker.y + range; y++) {
        for (let x = attacker.x - range; x <= attacker.x + range; x++) {
            const dx = x - attacker.x;
            const dy = y - attacker.y;
            if (dx === 0 && dy === 0) continue;
            if (dx * dx + dy * dy <= range * range) cells.push({ x, y });
        }
    }
    return cells.map((cell) => [cell]);
}

function getJumpAttackZones(
    attacker: Position,
    pattern: Extract<AttackPattern, { type: "jumpArea" }>,
): Position[][] {
    const zones: Position[][] = [];
    for (let y = attacker.y - pattern.range; y <= attacker.y + pattern.range; y++) {
        for (let x = attacker.x - pattern.range; x <= attacker.x + pattern.range; x++) {
            const anchor = { x, y };
            if (
                getGridDistance(attacker, anchor) > pattern.range ||
                (x === attacker.x && y === attacker.y)
            ) {
                continue;
            }

            zones.push(
                Array.from({ length: pattern.depth }, (_, row) =>
                    Array.from({ length: pattern.width }, (_, column) => ({
                        x: x + column,
                        y: y + row,
                    })),
                ).flat(),
            );
        }
    }
    return zones;
}

function getAreaAttackZones(
    attacker: Position,
    facing: Facing,
    pattern: Extract<AttackPattern, { type: "area" }>,
): Position[][] {
    const forward = FACING_VECTORS[facing];
    const lateral = { x: -forward.y, y: forward.x };
    const zones: Position[][] = [];
    for (let distance = 1; distance < pattern.range; distance++) {
        const zone: Position[] = [];
        for (let depth = 0; depth < pattern.depth; depth++) {
            for (let width = 0; width < pattern.width; width++) {
                zone.push({
                    x:
                        attacker.x +
                        forward.x * (distance + depth) +
                        lateral.x * (width - Math.floor(pattern.width / 2)),
                    y:
                        attacker.y +
                        forward.y * (distance + depth) +
                        lateral.y * (width - Math.floor(pattern.width / 2)),
                });
            }
        }
        zones.push(zone);
    }
    return zones;
}

export function canAttackMonster(
    attacker: Monster,
    attack: MonsterAttack,
    target: Monster,
): boolean {
    if (!target.flying) return true;
    return (
        attacker.flying === true ||
        (attack.pattern.type !== "adjacent" && attack.pattern.type !== "directionalArea")
    );
}

export function isWithinRadius(center: Position, target: Position, radius: number): boolean {
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    return dx * dx + dy * dy <= radius * radius;
}

export function isBehind(target: Position, attacker: Position, facing: Facing): boolean {
    const forward = FACING_VECTORS[facing];
    return (attacker.x - target.x) * forward.x + (attacker.y - target.y) * forward.y < 0;
}

export function getFacingFromMovement(
    source: Position,
    destination: Position,
    currentFacing: Facing,
): Facing {
    const deltaX = destination.x - source.x;
    const deltaY = destination.y - source.y;
    if (Math.abs(deltaX) > Math.abs(deltaY)) return deltaX > 0 ? "east" : "west";
    if (Math.abs(deltaY) > 0) return deltaY > 0 ? "south" : "north";
    return currentFacing;
}

export function canMoveMonsterTo(options: MovementOptions): boolean {
    return getMonsterMovementPath(options).length > 1;
}

export function getMonsterMovementPath(options: MovementOptions): Position[] {
    const {
        source,
        destination,
        deployedCells,
        occupiedCells,
        blockedCells,
        range = 2,
        hostileCells = [],
        canPassHostiles = false,
        boardSize = Number.POSITIVE_INFINITY,
    } = options;
    if (!isValidDestination(destination, deployedCells, occupiedCells, blockedCells, range)) {
        return [];
    }
    const key = (position: Position): string => `${position.x},${position.y}`;
    const hostileKeys = new Set(hostileCells.map(key));
    const blockedKeys = new Set(blockedCells.map(key));
    const visited = new Map<string, number>([[key(source), 0]]);
    const previous = new Map<string, Position>();
    const traversal: TraversalContext = {
        visited,
        blockedKeys,
        deployedCells,
        hostileKeys,
        canPassHostiles,
        boardSize,
    };
    const queue = [source];

    for (const current of queue) {
        const distance = visited.get(key(current)) ?? 0;
        if (isSamePosition(current, destination)) {
            if (distance === 0) return [];
            const path = [destination];
            let currentKey = key(destination);
            while (currentKey !== key(source)) {
                const parent = previous.get(currentKey);
                if (!parent) return [];
                path.unshift(parent);
                currentKey = key(parent);
            }
            return path;
        }
        if (distance >= range) continue;

        for (const neighbor of getOrthogonalNeighbors(current)) {
            const neighborKey = key(neighbor);
            if (!isTraversableCell(neighbor, neighborKey, traversal)) continue;
            visited.set(neighborKey, distance + 1);
            previous.set(neighborKey, current);
            queue.push(neighbor);
        }
    }
    return [];
}

function isValidDestination(
    destination: Position,
    deployedCells: readonly Position[],
    occupiedCells: readonly Position[],
    blockedCells: readonly Position[],
    range: number,
): boolean {
    return (
        range > 0 &&
        deployedCells.some((cell) => isSamePosition(cell, destination)) &&
        !occupiedCells.some((cell) => isSamePosition(cell, destination)) &&
        !blockedCells.some((cell) => isSamePosition(cell, destination))
    );
}

function isSamePosition(first: Position, second: Position): boolean {
    return first.x === second.x && first.y === second.y;
}

function getOrthogonalNeighbors(position: Position): Position[] {
    return [
        { x: position.x + 1, y: position.y },
        { x: position.x - 1, y: position.y },
        { x: position.x, y: position.y + 1 },
        { x: position.x, y: position.y - 1 },
    ];
}

function isTraversableCell(
    position: Position,
    positionKey: string,
    context: TraversalContext,
): boolean {
    return (
        position.x >= 0 &&
        position.y >= 0 &&
        position.x < context.boardSize &&
        position.y < context.boardSize &&
        !context.visited.has(positionKey) &&
        !context.blockedKeys.has(positionKey) &&
        context.deployedCells.some((cell) => isSamePosition(cell, position)) &&
        (context.canPassHostiles || !context.hostileKeys.has(positionKey))
    );
}
