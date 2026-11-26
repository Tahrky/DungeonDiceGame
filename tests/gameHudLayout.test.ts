import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
    default: { Scenes: { Events: { SHUTDOWN: "shutdown" } } },
}));

import { MONSTERS } from "../src/data/monsters";
import { GameHudInvocation } from "../src/scenes/game/GameHudInvocation";
import { getPatternToggleY } from "../src/scenes/game/hudLayout";

type Style = {
    fontSize?: string;
    wordWrap?: { width: number };
    padding?: { x: number; y: number };
};

class FakeText {
    x: number;
    y: number;
    width = 0;
    height = 0;
    scale = 1;
    depth = 0;
    fontSize: number;
    padding: { x: number; y: number };
    readonly text: string;
    readonly style: Style;

    constructor(x: number, y: number, text: string, style: Style) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.style = style;
        this.fontSize = Number.parseFloat(style.fontSize ?? "16");
        this.padding = style.padding ?? { x: 0, y: 0 };
        this.measure();
    }

    get displayWidth(): number {
        return this.width * this.scale;
    }

    get displayHeight(): number {
        return this.height * this.scale;
    }

    private measure(): void {
        const contentWidth = this.text.length * this.fontSize * 0.6;
        const wrapWidth = this.style.wordWrap?.width ?? contentWidth;
        this.width = Math.min(contentWidth, wrapWidth) + this.padding.x * 2;
        this.height =
            Math.ceil(contentWidth / Math.max(1, wrapWidth)) * this.fontSize * 1.2 +
            this.padding.y * 2;
    }

    setOrigin(): this {
        return this;
    }
    setInteractive(): this {
        return this;
    }
    on(): this {
        return this;
    }
    setDepth(depth: number): this {
        this.depth = depth;
        return this;
    }
    setScale(scale: number): this {
        this.scale = scale;
        return this;
    }
    setY(y: number): this {
        this.y = y;
        return this;
    }
    setFontSize(size: number): this {
        this.fontSize = size;
        this.measure();
        return this;
    }
    setPadding(x: number, y: number): this {
        this.padding = { x, y };
        this.measure();
        return this;
    }
    setFixedSize(width: number, height: number): this {
        this.width = width;
        this.height = height;
        return this;
    }
}

class FakeRectangle {
    depth = 0;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    constructor(x: number, y: number, width: number, height: number) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }
    setOrigin(): this {
        return this;
    }
    setStrokeStyle(): this {
        return this;
    }
    setInteractive(): this {
        return this;
    }
    on(): this {
        return this;
    }
}

class TestHud extends GameHudInvocation {
    protected renderActionStatus(): void {}
    protected renderPatternSelector(): void {}
}

describe("commandes de tour", () => {
    it.each([
        ["LANCER LES DES", false, true],
        ["TOUR DE L’ADVERSAIRE", true, false],
    ])("centre verticalement le texte de %s", (label, onlineGame, isLocalTurn) => {
        const texts: FakeText[] = [];
        const scene = {
            scale: { width: 1300 },
            cameras: { main: { getWorldPoint: (x: number, y: number) => ({ x, y }) } },
            add: {
                text: (x: number, y: number, text: string, style: Style) => {
                    const object = new FakeText(x, y, text, style);
                    texts.push(object);
                    return object;
                },
            },
            input: { on: () => {} },
            events: { once: () => {} },
        };
        const hud = Reflect.construct(TestHud, [scene, { add: () => {} }]);
        const state = { onlineGame, isLocalTurn, hasRolled: false, actionMode: { type: "idle" } };
        Reflect.apply(Reflect.get(hud, "renderTurnControls"), hud, [state, { rollDice: () => {} }]);

        const button = texts.find((text) => text.text === label)!;
        const textHeight = button.fontSize * 1.2;
        expect(Math.abs(button.height - textHeight - button.padding.y * 2)).toBeLessThan(2);
    });
});

describe("disposition du panneau d’invocation", () => {
    it.each([0.6, 1, 1.42, 2.84])(
        "sépare les commandes, les noms et les coûts avec un zoom de %s",
        (zoom) => {
            const texts: FakeText[] = [];
            const rectangles: FakeRectangle[] = [];
            const scene = {
                scale: { width: 1300 * zoom, height: 760 * zoom },
                cameras: {
                    main: {
                        getWorldPoint: (x: number, y: number) => ({ x: x / zoom, y: y / zoom }),
                    },
                },
                add: {
                    text: (x: number, y: number, text: string, style: Style) => {
                        const object = new FakeText(x, y, text, style);
                        texts.push(object);
                        return object;
                    },
                    rectangle: (x: number, y: number, width: number, height: number) => {
                        const object = new FakeRectangle(x, y, width, height);
                        rectangles.push(object);
                        return object;
                    },
                },
                input: { on: () => {} },
                events: { once: () => {} },
            };
            const hud = Reflect.construct(TestHud, [scene, { add: () => {} }]);
            const state = {
                currentPlayer: 1,
                rolledDice: [],
                diceReserves: { 1: { invocation: 20 } },
                placedMonsters: [],
                maxMonstersPerPlayer: 8,
                maxSummonsPerMonster: 2,
                availableMonsters: MONSTERS,
                invocationMenuOpen: true,
                selectedMonster: MONSTERS[5],
                pendingCells: null,
                actionMode: { type: "idle" },
                patternSelectorExpanded: true,
            };
            const actions = { toggleInvocationMenu: () => {}, cancelInvocation: () => {} };
            Reflect.apply(Reflect.get(hud, "renderMonsterSelection"), hud, [state, actions]);

            const button = texts.find((text) => text.text.startsWith("INVOCATION"))!;
            const header = texts.find((text) => text.text.startsWith("MONSTRE — COÛT"))!;
            const rows = rectangles.filter((rectangle) => rectangle.width === 200);
            const instruction = texts.find((text) => text.text.startsWith("Monstre :"))!;
            const cancel = texts.find((text) => text.text === "ANNULER")!;
            expect(header.y).toBeGreaterThanOrEqual(button.y + button.height);
            expect(header.displayWidth).toBeLessThanOrEqual(200);
            expect(rows).toHaveLength(MONSTERS.length);
            expect(rows[0].y).toBeGreaterThanOrEqual(header.y + header.displayHeight);
            for (let index = 0; index < rows.length; index++) {
                const row = rows[index];
                if (index > 0)
                    expect(row.y).toBeGreaterThanOrEqual(
                        rows[index - 1].y + rows[index - 1].height,
                    );
                const name = texts.find(
                    (text) =>
                        MONSTERS.some((monster) => monster.name === text.text) &&
                        text.y === row.y + row.height / 2,
                )!;
                const cost = texts.find((text) => text.text.endsWith("🐍") && text.y === name.y)!;
                expect(name.x + name.displayWidth).toBeLessThanOrEqual(cost.x - cost.displayWidth);
                expect(name.displayHeight).toBeLessThanOrEqual(row.height);
            }
            const lastRow = rows.at(-1)!;
            expect(instruction.y).toBeGreaterThanOrEqual(lastRow.y + lastRow.height);
            expect(cancel.y).toBeGreaterThanOrEqual(instruction.y + instruction.height);
            expect(cancel.y + cancel.height).toBeLessThanOrEqual(
                Reflect.apply(getPatternToggleY, undefined, [scene, true]),
            );
        },
    );
});
