import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
    default: {
        Math: {
            Clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)),
        },
    },
}));

import { formatMonsterSummary } from "../src/components/deck/monsterSummary";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { createPlacedMonster } from "../src/game/monsterActions";
import { MonsterTooltip } from "../src/scenes/game/MonsterTooltip";

class FakeText {
    readonly width: number;
    readonly height = 16;
    readonly text: string;
    x: number;
    y: number;
    destroyed = false;

    constructor(x: number, y: number, text: string) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.width = text.length * 7;
    }

    setPadding(): this {
        return this;
    }

    setX(x: number): this {
        this.x = x;
        return this;
    }

    destroy(): void {
        this.destroyed = true;
    }
}

class FakeRectangle {
    readonly width: number;
    readonly height: number;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
    }

    setOrigin(): this {
        return this;
    }

    setStrokeStyle(): this {
        return this;
    }

    destroy(): void {}
}

class FakeContainer {
    children: (FakeText | FakeRectangle)[] = [];
    width = 0;
    height = 0;

    add(children: FakeText | FakeRectangle | (FakeText | FakeRectangle)[]): void {
        this.children.push(...(Array.isArray(children) ? children : [children]));
    }

    removeAll(destroy: boolean): void {
        if (destroy) this.children.forEach((child) => child.destroy());
        this.children = [];
    }

    setSize(width: number, height: number): void {
        this.width = width;
        this.height = height;
    }

    setPosition(): void {}
}

describe("infobulle de monstre en jeu", () => {
    it("affiche l’armure sur la ligne des PV et la nettoie avec l’infobulle", () => {
        const ghost = getDefaultGameConfiguration().monsters.find(({ id }) => id === "ghost")!;
        const monster = { ...ghost, armor: 3 };
        const placed = createPlacedMonster("test", monster, 1, { x: 5, y: 4 }, [{ x: 5, y: 4 }], 0);
        placed.currentHp = 1;
        placed.statusEffects = [
            {
                type: "damageOverTime",
                damagePerTurn: 1,
                duration: 2,
                remainingTurns: 2,
                color: "green",
            },
        ];
        const texts: FakeText[] = [];
        const container = new FakeContainer();
        const scene = {
            add: {
                text: (x: number, y: number, text: string) => {
                    const label = new FakeText(x, y, text);
                    texts.push(label);
                    return label;
                },
                rectangle: (_x: number, _y: number, width: number, height: number) =>
                    new FakeRectangle(width, height),
            },
            cameras: {
                main: {
                    getWorldPoint: (x: number, y: number) => ({ x, y }),
                    worldView: { x: 0, y: 0, width: 1200, height: 700 },
                },
            },
        };
        const tooltip: MonsterTooltip = Reflect.construct(MonsterTooltip, [
            scene,
            container,
            () => ({ x: 200, y: 200 }),
            (position: { x: number; y: number }) => position,
            () => ({}),
        ]);
        Reflect.apply(tooltip.update, tooltip, [{ x: 5, y: 4 }, [placed]]);

        const armor = texts.find(({ text }) => text === " · Armure : 3");
        const total = texts.find(({ text }) => text === "2 PV");
        const status = texts.find(({ text }) => text === "-1 PV / Tour");
        expect(formatMonsterSummary(monster)).toContain(" · Armure : 3");
        expect(armor).toBeDefined();
        expect(total).toBeDefined();
        expect(status).toBeDefined();
        if (!armor || !total || !status) throw new Error("Éléments d’infobulle manquants.");
        expect(container.children).toContain(armor);
        expect(armor.y).toBe(total.y);
        expect(armor.x).toBe(total.x + total.width);
        expect(status.x).toBeGreaterThanOrEqual(armor.x + armor.width);
        expect(container.width).toBeGreaterThanOrEqual(status.x + status.width);
        expect(texts.every((label) => container.children.includes(label))).toBe(true);

        Reflect.apply(tooltip.update, tooltip, [{ x: 0, y: 0 }, [placed]]);
        expect(container.children).toHaveLength(0);
        expect(texts.every((label) => label.destroyed)).toBe(true);

        Reflect.apply(tooltip.update, tooltip, [{ x: 0, y: 0 }, [], ghost, 1]);
        const zeroArmor = texts.find(({ text }) => text === " · Armure : 0");
        expect(formatMonsterSummary(ghost)).toContain(" · Armure : 0");
        expect(container.children).toContain(zeroArmor);
        Reflect.apply(tooltip.update, tooltip, [{ x: 0, y: 0 }, []]);
        expect(texts.every((label) => label.destroyed)).toBe(true);
    });
});
