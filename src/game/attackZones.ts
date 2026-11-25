import type { AttackPattern, Facing, Position } from "../types/GameTypes";
import { FACING_VECTORS, getGridDistance } from "./geometry";

export interface AttackZoneOption {
    readonly target: Position;
    readonly cells: Position[];
}

type PatternOf<Type extends AttackPattern["type"]> = Extract<AttackPattern, { type: Type }>;

export function getAttackZones(
    attacker: Position,
    facing: Facing,
    pattern: AttackPattern,
): Position[][] {
    switch (pattern.type) {
        case "directionalArea":
            return getDirectionalAreaOptions(attacker, pattern).map((option) => option.cells);
        case "adjacent":
            return Object.values(FACING_VECTORS).map(({ x, y }) => [
                { x: attacker.x + x, y: attacker.y + y },
            ]);
        case "line":
            return getLineAttackZones(attacker, facing, pattern);
        case "radius":
            return getCellsWithinRadius(attacker, pattern.range).map((cell) => [cell]);
        case "selfRadius":
            return [getCellsWithinRadius(attacker, pattern.range)];
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
    const options =
        pattern.type === "directionalArea"
            ? getDirectionalAreaOptions(attacker, pattern)
            : getAttackZones(attacker, facing, pattern).flatMap((cells) =>
                  getZoneTargets(pattern, cells).map((target) => ({ target, cells })),
              );
    return targetsSelf ? [...options, { target: attacker, cells: [attacker] }] : options;
}

function getZoneTargets(pattern: AttackPattern, cells: Position[]): Position[] {
    if (pattern.type === "jumpArea" || (pattern.type === "line" && (pattern.length ?? 1) > 1)) {
        return [cells[0]!];
    }
    return cells;
}

function getRectangleCells(
    attacker: Position,
    forward: Position,
    firstDistance: number,
    depth: number,
    width: number,
): Position[] {
    const lateral = { x: -forward.y, y: forward.x };
    const cells: Position[] = [];
    for (let row = 0; row < depth; row++) {
        for (let column = 0; column < width; column++) {
            const offset = column - Math.floor(width / 2);
            cells.push({
                x: attacker.x + forward.x * (firstDistance + row) + lateral.x * offset,
                y: attacker.y + forward.y * (firstDistance + row) + lateral.y * offset,
            });
        }
    }
    return cells;
}

function getDirectionalAreaOptions(
    attacker: Position,
    pattern: PatternOf<"directionalArea">,
): AttackZoneOption[] {
    return Object.values(FACING_VECTORS).map((direction) => ({
        target: { x: attacker.x + direction.x, y: attacker.y + direction.y },
        cells: getRectangleCells(attacker, direction, 1, pattern.depth, pattern.width),
    }));
}

function getAreaAttackZones(
    attacker: Position,
    facing: Facing,
    pattern: PatternOf<"area">,
): Position[][] {
    return Array.from({ length: Math.max(0, pattern.range - 1) }, (_, index) =>
        getRectangleCells(
            attacker,
            FACING_VECTORS[facing],
            index + 1,
            pattern.depth,
            pattern.width,
        ),
    );
}

function getLineAttackZones(
    attacker: Position,
    facing: Facing,
    pattern: PatternOf<"line">,
): Position[][] {
    const directions = pattern.allDirections
        ? Object.values(FACING_VECTORS)
        : [FACING_VECTORS[facing]];
    const length = pattern.length ?? 1;
    const minRange = pattern.minRange ?? 1;
    return directions.flatMap((direction) =>
        Array.from({ length: Math.max(0, pattern.range - minRange + 1) }, (_, index) =>
            Array.from({ length }, (_unused, cellIndex) => ({
                x: attacker.x + direction.x * (minRange + index + cellIndex),
                y: attacker.y + direction.y * (minRange + index + cellIndex),
            })),
        ),
    );
}

function getCellsWithinRadius(attacker: Position, range: number): Position[] {
    const cells: Position[] = [];
    for (let y = attacker.y - range; y <= attacker.y + range; y++) {
        for (let x = attacker.x - range; x <= attacker.x + range; x++) {
            const dx = x - attacker.x;
            const dy = y - attacker.y;
            if ((dx !== 0 || dy !== 0) && dx * dx + dy * dy <= range * range) cells.push({ x, y });
        }
    }
    return cells;
}

function getJumpAttackZones(attacker: Position, pattern: PatternOf<"jumpArea">): Position[][] {
    const zones: Position[][] = [];
    for (let y = attacker.y - pattern.range; y <= attacker.y + pattern.range; y++) {
        for (let x = attacker.x - pattern.range; x <= attacker.x + pattern.range; x++) {
            if (
                getGridDistance(attacker, { x, y }) > pattern.range ||
                (x === attacker.x && y === attacker.y)
            ) {
                continue;
            }
            zones.push(
                Array.from({ length: pattern.depth * pattern.width }, (_, index) => ({
                    x: x + (index % pattern.width),
                    y: y + Math.floor(index / pattern.width),
                })),
            );
        }
    }
    return zones;
}
