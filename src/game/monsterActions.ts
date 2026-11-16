import type {
    AttackPattern,
    Facing,
    Monster,
    MonsterAttack,
    MonsterTurnBuffs,
    PlacedMonster,
    PlayerId,
    Position,
} from "../types/GameTypes";

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
    readonly canPassUndeployedCells?: boolean;
    boardWidth?: number;
    boardHeight?: number;
}

export interface AttackZoneOption {
    readonly target: Position;
    readonly cells: Position[];
}

type MovementTraversalOptions = Pick<
    MovementOptions,
    | "deployedCells"
    | "blockedCells"
    | "hostileCells"
    | "canPassHostiles"
    | "canPassUndeployedCells"
    | "boardWidth"
    | "boardHeight"
>;

interface TraversalContext {
    visited: ReadonlyMap<string, number>;
    blockedKeys: ReadonlySet<string>;
    deployedKeys: ReadonlySet<string>;
    hostileKeys: ReadonlySet<string>;
    canPassHostiles: boolean;
    canPassUndeployedCells: boolean;
    boardWidth: number;
    boardHeight: number;
}

export function getGridDistance(first: Position, second: Position): number {
    return Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
}

export function hasLineOfSight(
    source: Position,
    target: Position,
    blockingCells: readonly Position[],
): boolean {
    const blockedKeys = new Set(blockingCells.map(({ x, y }) => `${x},${y}`));
    const deltaX = target.x - source.x;
    const deltaY = target.y - source.y;
    const stepX = Math.sign(deltaX);
    const stepY = Math.sign(deltaY);
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    let traversedX = 0;
    let traversedY = 0;
    let x = source.x;
    let y = source.y;

    while (traversedX < absX || traversedY < absY) {
        const nextCell =
            (1 + 2 * traversedX) * absY - (1 + 2 * traversedY) * absX;
        if (nextCell === 0) {
            if (
                blockedKeys.has(`${x + stepX},${y}`) &&
                blockedKeys.has(`${x},${y + stepY}`)
            ) {
                return false;
            }
            x += stepX;
            y += stepY;
            traversedX++;
            traversedY++;
        } else if (nextCell < 0) {
            x += stepX;
            traversedX++;
        } else {
            y += stepY;
            traversedY++;
        }

        if ((x !== target.x || y !== target.y) && blockedKeys.has(`${x},${y}`)) {
            return false;
        }
    }

    return true;
}

export function getInitialAttackCooldowns(monster: Pick<Monster, "attacks">): number[] {
    return monster.attacks.map(
        (attack) => attack.initialCooldownTurns ?? attack.cooldownTurns ?? 0,
    );
}

export function getInitialAttackUses(monster: Pick<Monster, "attacks">): number[] {
    return monster.attacks.map(() => 0);
}

export function getMovementRange(
    monster: Pick<Monster, "movementRange">,
    bonus = 0,
): number {
    return monster.movementRange + bonus;
}

export function getMovementCost(
    monster: Pick<Monster, "movementCost">,
    reduction = 0,
): number {
    return Math.max(0, (monster.movementCost ?? 1) - reduction);
}

export function getAttackCost(attack: Pick<MonsterAttack, "cost">, reduction = 0): number {
    return Math.max(0, attack.cost - reduction);
}

export function getAttackDamage(attack: Pick<MonsterAttack, "damage">, bonus = 0): number {
    return attack.damage + bonus;
}

export function applyMonsterTurnBuff(
    monster: Pick<PlacedMonster, "turnBuffs">,
    buff: MonsterTurnBuffs,
): void {
    const current = monster.turnBuffs ?? {};
    monster.turnBuffs = {
        movementRangeBonus:
            (current.movementRangeBonus ?? 0) + (buff.movementRangeBonus ?? 0),
        movementCostReduction:
            (current.movementCostReduction ?? 0) + (buff.movementCostReduction ?? 0),
        attackDamageBonus: (current.attackDamageBonus ?? 0) + (buff.attackDamageBonus ?? 0),
        attackCostReduction: (current.attackCostReduction ?? 0) + (buff.attackCostReduction ?? 0),
    };
}

export function clearMonsterTurnBuff(monster: Pick<PlacedMonster, "turnBuffs">): void {
    monster.turnBuffs = undefined;
}

export function canPassHostileMonsters(
    monster: Pick<Monster, "flying" | "canPassHostiles">,
): boolean {
    return monster.flying === true || monster.canPassHostiles === true;
}

export function getMovementActionsPerTurn(
    monster: Pick<Monster, "movementActionsPerTurn">,
): number {
    return monster.movementActionsPerTurn ?? 1;
}

export function getAttackActionsPerTurn(
    monster: Pick<Monster, "attackActionsPerTurn">,
): number {
    return monster.attackActionsPerTurn ?? 1;
}

export function canUseActionThisTurn(actionsUsed: number, actionLimit: number): boolean {
    return actionsUsed < actionLimit;
}

export function canAttackBaseThisTurn(
    summonedOnTurn: number | undefined,
    currentTurn: number,
): boolean {
    return summonedOnTurn !== currentTurn;
}

export function canUseMonsterAttackThisTurn(
    attack: Pick<MonsterAttack, "usesPerTurn">,
    usesThisTurn: number,
): boolean {
    return attack.usesPerTurn === undefined || usesThisTurn < attack.usesPerTurn;
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
        case "selfRadius":
            return [getSelfRadiusAttackZone(attacker, pattern.range)];
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
    targetsSelf = false,
): AttackZoneOption[] {
    if (pattern.type === "directionalArea") {
        const options = getDirectionalAreaOptions(attacker, pattern);
        return targetsSelf
            ? [...options, { target: attacker, cells: [attacker] }]
            : options;
    }

    const options = getAttackZones(attacker, facing, pattern).flatMap((cells) => {
        const targetCells =
            pattern.type === "selfRadius"
                ? cells
                : pattern.type === "jumpArea" ||
            (pattern.type === "line" && (pattern.length ?? 1) > 1)
                ? [cells[0]]
                : cells;
        return targetCells.map((target) => ({ target, cells }));
    });
    return targetsSelf ? [...options, { target: attacker, cells: [attacker] }] : options;
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

function getSelfRadiusAttackZone(attacker: Position, range: number): Position[] {
    const cells: Position[] = [];
    for (let y = attacker.y - range; y <= attacker.y + range; y++) {
        for (let x = attacker.x - range; x <= attacker.x + range; x++) {
            const dx = x - attacker.x;
            const dy = y - attacker.y;
            if ((dx !== 0 || dy !== 0) && dx * dx + dy * dy <= range * range) {
                cells.push({ x, y });
            }
        }
    }
    return cells;
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
    if (!target.highAltitude) return true;
    return (
        attacker.flying === true ||
        (attack.pattern.type !== "adjacent" && attack.pattern.type !== "directionalArea")
    );
}

export function canTargetMonsterOwner(
    attack: Pick<MonsterAttack, "hitsAllies" | "targetsAlliesOnly">,
    targetOwner: PlayerId,
    currentPlayer: PlayerId,
): boolean {
    if (attack.targetsAlliesOnly) return targetOwner === currentPlayer;
    return attack.hitsAllies === true || targetOwner !== currentPlayer;
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
        canPassUndeployedCells = false,
        boardWidth = Number.POSITIVE_INFINITY,
        boardHeight = Number.POSITIVE_INFINITY,
    } = options;
    if (!isValidDestination(destination, deployedCells, occupiedCells, blockedCells, range)) {
        return [];
    }

    const key = (position: Position): string => `${position.x},${position.y}`;
    const sourceKey = key(source);
    const destinationKey = key(destination);
    const visited = new Map<string, number>([[sourceKey, 0]]);
    const previous = new Map<string, Position>();
    const traversal: TraversalContext = {
        visited,
        blockedKeys: new Set(blockedCells.map(key)),
        deployedKeys: new Set(deployedCells.map(key)),
        hostileKeys: new Set(hostileCells.map(key)),
        canPassHostiles,
        canPassUndeployedCells,
        boardWidth,
        boardHeight,
    };

    const queue = [source];
    for (let index = 0; index < queue.length; index++) {
        const current = queue[index]!;
        const currentKey = key(current);
        const distance = visited.get(currentKey) ?? 0;
        if (currentKey === destinationKey) {
            if (distance === 0) return [];
            const path = [destination];
            let pathKey = destinationKey;
            while (pathKey !== sourceKey) {
                const parent = previous.get(pathKey);
                if (!parent) return [];
                path.unshift(parent);
                pathKey = key(parent);
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

export function getMovementPathMap(options: MovementOptions): Map<string, Position[]> {
    const {
        source,
        deployedCells,
        occupiedCells,
        blockedCells,
        range = 2,
        hostileCells = [],
        canPassHostiles = false,
        canPassUndeployedCells = false,
        boardWidth = Number.POSITIVE_INFINITY,
        boardHeight = Number.POSITIVE_INFINITY,
    } = options;
    const paths = new Map<string, Position[]>();
    if (range <= 0) return paths;

    const key = (position: Position): string => `${position.x},${position.y}`;
    const sourceKey = key(source);
    const hostileKeys = new Set(hostileCells.map(key));
    const blockedKeys = new Set(blockedCells.map(key));
    const deployedKeys = new Set(deployedCells.map(key));
    const visited = new Map<string, number>([[sourceKey, 0]]);
    const previous = new Map<string, Position>();
    const traversal: TraversalContext = {
        visited,
        blockedKeys,
        deployedKeys,
        hostileKeys,
        canPassHostiles,
        canPassUndeployedCells,
        boardWidth,
        boardHeight,
    };
    const queue = [source];

    for (let index = 0; index < queue.length; index++) {
        const current = queue[index]!;
        const distance = visited.get(key(current)) ?? 0;
        if (distance >= range) continue;

        for (const neighbor of getOrthogonalNeighbors(current)) {
            const neighborKey = key(neighbor);
            if (!isTraversableCell(neighbor, neighborKey, traversal)) continue;
            visited.set(neighborKey, distance + 1);
            previous.set(neighborKey, current);
            queue.push(neighbor);
        }
    }

    for (const destination of deployedCells) {
        const destinationKey = key(destination);
        if (
            destinationKey === sourceKey ||
            !visited.has(destinationKey) ||
            !isValidDestination(destination, deployedCells, occupiedCells, blockedCells, range)
        ) {
            continue;
        }
        const path = [destination];
        let currentKey = destinationKey;
        while (currentKey !== sourceKey) {
            const parent = previous.get(currentKey);
            if (!parent) break;
            path.unshift(parent);
            currentKey = key(parent);
        }
        if (currentKey === sourceKey) paths.set(destinationKey, path);
    }
    return paths;
}

export function getMovementDistanceMap(
    destinations: readonly Position[],
    options: MovementTraversalOptions,
): Map<string, number> {
    const distances = new Map<string, number>();
    const blockedKeys = new Set(options.blockedCells.map((cell) => `${cell.x},${cell.y}`));
    const hostileKeys = new Set((options.hostileCells ?? []).map((cell) => `${cell.x},${cell.y}`));
    const traversal: TraversalContext = {
        visited: distances,
        blockedKeys,
        deployedKeys: new Set(options.deployedCells.map((cell) => `${cell.x},${cell.y}`)),
        hostileKeys,
        canPassHostiles: options.canPassHostiles ?? false,
        canPassUndeployedCells: options.canPassUndeployedCells ?? false,
        boardWidth: options.boardWidth ?? Number.POSITIVE_INFINITY,
        boardHeight: options.boardHeight ?? Number.POSITIVE_INFINITY,
    };
    const queue: Position[] = [];

    for (const destination of destinations) {
        const key = `${destination.x},${destination.y}`;
        if (isTraversableCell(destination, key, traversal)) {
            distances.set(key, 0);
            queue.push(destination);
        }
    }

    for (let index = 0; index < queue.length; index++) {
        const current = queue[index]!;
        const currentKey = `${current.x},${current.y}`;
        const distance = distances.get(currentKey)!;
        for (const neighbor of getOrthogonalNeighbors(current)) {
            const neighborKey = `${neighbor.x},${neighbor.y}`;
            if (!isTraversableCell(neighbor, neighborKey, traversal)) continue;
            distances.set(neighborKey, distance + 1);
            queue.push(neighbor);
        }
    }
    return distances;
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
        position.x < context.boardWidth &&
        position.y < context.boardHeight &&
        !context.visited.has(positionKey) &&
        !context.blockedKeys.has(positionKey) &&
        (context.canPassUndeployedCells || context.deployedKeys.has(positionKey)) &&
        (context.canPassHostiles || !context.hostileKeys.has(positionKey))
    );
}
