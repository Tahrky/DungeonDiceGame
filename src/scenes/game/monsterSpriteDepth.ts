import type Phaser from "phaser";

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
    return first.depth - second.depth || first.x - second.x || first.id.localeCompare(second.id);
}

export function moveToSortedIndex(
    container: Phaser.GameObjects.Container,
    item: Phaser.GameObjects.GameObject,
    compare: (
        first: Phaser.GameObjects.GameObject,
        second: Phaser.GameObjects.GameObject,
    ) => number,
): void {
    let index = container.getIndex(item);
    while (index > 0 && compare(item, container.list[index - 1]!) < 0) {
        container.moveTo(item, index - 1);
        index--;
    }
    while (index < container.list.length - 1 && compare(item, container.list[index + 1]!) > 0) {
        container.moveTo(item, index + 1);
        index++;
    }
}
