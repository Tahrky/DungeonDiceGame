import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ default: { Scene: class {} } }));

import { DICE } from "../src/data/dice";
import { rollDieSymbol } from "../src/game/diceResources";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import {
    createMatchRandomStreams,
    getMatchRandomState,
    restoreMatchRandomStreams,
} from "../src/game/random";
import { GameSceneInvocation } from "../src/scenes/GameSceneInvocation";
import { isGameSnapshot } from "../src/scenes/GameSceneProtocol";
import type { GameHudActions } from "../src/scenes/game/GameHud";
import type { GameSnapshot } from "../src/types/GameTypes";

class DiceScene extends GameSceneInvocation {
    protected drawBoard(): void {}
    protected render(): void {}
    protected handleBoardAction(): void {}
    protected handleMovementAction(): void {}
    protected get hudActions(): GameHudActions {
        throw new Error("Interface non utilisée par ce test.");
    }

    start(seed: number): void {
        this.init({ mode: "computer", randomSeed: seed });
    }

    roll() {
        this.hasRolled = false;
        this.rolledDice = [];
        this.rollDice(true);
        return this.rolledDice.map(({ symbol }) => symbol);
    }

    save(): GameSnapshot {
        return structuredClone(this.createSnapshot());
    }

    restore(snapshot: GameSnapshot): void {
        this.applySnapshot(snapshot);
    }
}

describe("hasard reproductible", () => {
    it("reprend indépendamment les flux de dés et de décisions à leur état enregistré", () => {
        const streams = createMatchRandomStreams(731);
        streams.dice();
        streams.actions[1]();
        streams.actions[2]();
        streams.actions[2]();
        const restored = restoreMatchRandomStreams(getMatchRandomState(streams));
        for (let index = 0; index < 5; index++) {
            expect(restored.dice()).toBe(streams.dice());
            expect(restored.actions[1]()).toBe(streams.actions[1]());
            expect(restored.actions[2]()).toBe(streams.actions[2]());
        }
    });

    it("utilise le même flux de dés que la simulation et reprend après sauvegarde", () => {
        const scene = new DiceScene();
        scene.start(731);
        const streams = createMatchRandomStreams(731);
        const expected = DICE.slice(0, getDefaultGameConfiguration().diceCount).map((die) =>
            rollDieSymbol(die, false, (count) => Math.floor(streams.dice() * count)),
        );
        expect(scene.roll()).toEqual(expected);
        const snapshot = scene.save();
        const resumed = new DiceScene();
        resumed.start(123);
        resumed.restore(snapshot);
        expect(resumed.roll()).toEqual(scene.roll());
        expect(resumed.save().randomState).toEqual(scene.save().randomState);
    });

    it("accepte les anciennes sauvegardes mais refuse un état aléatoire invalide", () => {
        const scene = new DiceScene();
        scene.start(731);
        const snapshot = scene.save();
        const legacy = { ...snapshot };
        delete legacy.randomState;
        expect(isGameSnapshot(legacy)).toBe(true);
        expect(
            isGameSnapshot({ ...snapshot, randomState: { dice: 0, actions: { 1: 1, 2: 2 } } }),
        ).toBe(false);
    });
});
