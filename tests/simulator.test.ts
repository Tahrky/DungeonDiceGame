import { describe, expect, it } from "vitest";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { chooseDeck } from "../src/simulation/strategies";
import { runSimulations } from "../src/simulation/simulator";
import type { SimulationOptions } from "../src/simulation/types";

describe("simulation de matchs", () => {
    it("produit un résultat reproductible avec l'état final et les décisions du bot", () => {
        const options: SimulationOptions = {
            games: 2,
            seed: 42,
            maxTurns: 1,
            profile1: "cheap",
            profile2: "offensive",
        };
        const first = runSimulations(options);
        const second = runSimulations(options);
        const match = first.matches[0];

        expect(match).toBeDefined();
        expect(first.summary.matches).toBe(2);
        expect(match?.seed).toBe(42);
        expect(match?.profiles).toEqual({ 1: "cheap", 2: "offensive" });
        expect(first.matches.map(({ startingPlayer }) => startingPlayer)).toEqual([1, 2]);
        expect(match?.history.some((event) => event.type === "dice")).toBe(true);
        expect(match?.history.some((event) => event.type === "strategy")).toBe(true);
        expect(match?.finalBoard.rows).toHaveLength(match?.finalBoard.height);
        expect(match?.finalBoard.rows.every((row) => row.length === match?.finalBoard.width)).toBe(
            true,
        );
        expect(first.matches).toEqual(second.matches);
    });

    it("sélectionne des decks distincts selon les profils économiques et de soutien", () => {
        const monsters = getDefaultGameConfiguration().monsters;
        const cheap = chooseDeck(monsters, "cheap", 5);
        const expensive = chooseDeck(monsters, "expensive", 5);
        const support = chooseDeck(monsters, "support", 5);
        const supportMonsters = new Set(
            monsters
                .filter((monster) => monster.attacks.some((attack) => attack.targetsAlliesOnly))
                .map((monster) => monster.id),
        );

        expect(cheap).not.toEqual(expensive);
        expect(support.some((id) => supportMonsters.has(id))).toBe(true);
    });

    it("utilise les déplacements et attaques tactiques pendant les matchs", () => {
        const result = runSimulations({
            games: 1,
            seed: 193,
            maxTurns: 5,
            profile1: "offensive",
            profile2: "balanced",
        });
        const events = result.matches.flatMap((match) => match.history);

        expect(events.some((event) => event.type === "movement")).toBe(true);
        expect(events.some((event) => event.type === "attack")).toBe(true);
    });
});
