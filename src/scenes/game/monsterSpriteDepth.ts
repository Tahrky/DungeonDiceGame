export interface MonsterSpriteDepth {
    readonly depth: number;
    readonly x: number;
    readonly id: string;
}

export function getMonsterSpriteDepth(screenY: number, facingOffsetY = 0): number {
    return screenY - facingOffsetY;
}

export function compareMonsterSpriteDepth(
    first: MonsterSpriteDepth,
    second: MonsterSpriteDepth,
): number {
    return (
        first.depth - second.depth ||
        first.x - second.x ||
        first.id.localeCompare(second.id)
    );
}
