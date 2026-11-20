import { describe, expect, it } from "vitest";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { getUniqueMonsterSymbols } from "../src/game/monsterSymbols";
import { DEFAULT_BOT_STRATEGY_WEIGHTS } from "../src/game/botStrategy";
import { chooseDeck } from "../src/simulation/strategies";
import { runSimulations } from "../src/simulation/simulator";
import { parseSimulationData } from "../src/simulation/analysis";
import type { SimulationOptions } from "../src/simulation/types";

function createRandom(seed: number): () => number {
    let value = seed;
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 0x1_0000_0000;
    };
}

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
        expect(match?.statistics[1]).not.toHaveProperty("unusedResources");
        expect(match?.remainingResources[1]).toBeDefined();
        expect(first.matches.map(({ startingPlayer }) => startingPlayer)).toEqual([1, 2]);
        expect(match?.history.some((event) => event.type === "dice")).toBe(true);
        expect(match?.history.some((event) => event.type === "strategy")).toBe(true);
        expect(match?.finalBoard.rows).toHaveLength(match?.finalBoard.height);
        expect(match?.finalBoard.rows.every((row) => row.length === match?.finalBoard.width)).toBe(
            true,
        );
        const monsterLegend = match?.finalBoard.legend.filter(({ symbol }) =>
            /^[A-Z]$/.test(symbol),
        );
        expect(new Set(monsterLegend?.map(({ symbol }) => symbol)).size).toBe(
            monsterLegend?.length,
        );
        expect(match?.finalMonsters.every((monster) => /^[A-Z]$/.test(monster.symbol))).toBe(true);
        expect(first.matches).toEqual(second.matches);
    });

    it("allège les résultats sans modifier le déroulement du match", () => {
        const options: SimulationOptions = {
            games: 1,
            seed: 42,
            maxTurns: 1,
            profile1: "cheap",
            profile2: "offensive",
        };
        const fullResult = runSimulations(options);
        const lightResult = runSimulations({ ...options, lightResults: true });
        const fullMatch = fullResult.matches[0];
        const lightMatch = lightResult.matches[0];
        if (!fullMatch || !lightMatch) throw new Error("Matchs de test attendus.");

        expect(lightMatch).toEqual({ ...fullMatch, history: [] });
        expect(lightResult.summary).toEqual(fullResult.summary);
        expect(fullMatch.history.length).toBeGreaterThan(0);
        expect(parseSimulationData(lightResult)).not.toBeNull();
        expect(() => runSimulations({ ...options, debug: true, lightResults: true })).toThrow(
            "--debug ne peut pas être combiné avec --light-results.",
        );
    });

    it("ne trace les attaques que sur demande et conserve les options légales avec d’autres poids", () => {
        const options: SimulationOptions = {
            games: 1,
            seed: 731,
            maxTurns: 10,
            profile1: "balanced",
            profile2: "defensive",
            lightResults: true,
        };
        const withoutTrace = runSimulations(options).matches[0];
        const baseline = runSimulations({ ...options, recordDecisionTraces: true }).matches[0];
        const weighted = runSimulations({
            ...options,
            recordDecisionTraces: true,
            strategyWeights: {
                balanced: { ...DEFAULT_BOT_STRATEGY_WEIGHTS, damage: 1.5 },
            },
        }).matches[0];
        if (!withoutTrace || !baseline || !weighted) throw new Error("Matchs de test attendus.");

        expect(withoutTrace).not.toHaveProperty("decisionTraces");
        expect(baseline.decisionTraces?.length).toBeGreaterThan(0);
        const baselineDecision = baseline.decisionTraces?.[0];
        const weightedDecision = weighted.decisionTraces?.[0];
        expect(baselineDecision).toBeDefined();
        expect(weightedDecision).toBeDefined();
        expect(
            baselineDecision?.candidates
                .map(
                    ({ attackerMonsterId, attackIndex, target }) =>
                        `${attackerMonsterId}:${attackIndex}:${target.x},${target.y}`,
                )
                .sort(),
        ).toEqual(
            weightedDecision?.candidates
                .map(
                    ({ attackerMonsterId, attackIndex, target }) =>
                        `${attackerMonsterId}:${attackIndex}:${target.x},${target.y}`,
                )
                .sort(),
        );
    });

    it("utilise la paire de profils correspondant à l’index global du match", () => {
        const result = runSimulations({
            games: 3,
            seed: 42,
            maxTurns: 1,
            profile1: "cheap",
            profile2: "offensive",
            profilePairs: [
                { profile1: "balanced", profile2: "cheap" },
                { profile1: "tracker", profile2: "support" },
            ],
        });

        expect(result.matches.map(({ profiles }) => profiles)).toEqual([
            { 1: "balanced", 2: "cheap" },
            { 1: "tracker", 2: "support" },
            { 1: "balanced", 2: "cheap" },
        ]);
    });

    it("alterne le joueur qui commence à chaque répétition d’une même confrontation", () => {
        const result = runSimulations({
            games: 6,
            seed: 42,
            maxTurns: 1,
            profile1: "cheap",
            profile2: "offensive",
            profilePairs: [
                { profile1: "balanced", profile2: "cheap" },
                { profile1: "tracker", profile2: "support" },
            ],
        });
        const firstPairStarts = result.matches
            .filter(({ profiles }) => profiles[1] === "balanced")
            .map(({ startingPlayer }) => startingPlayer);
        const secondPairStarts = result.matches
            .filter(({ profiles }) => profiles[1] === "tracker")
            .map(({ startingPlayer }) => startingPlayer);

        expect(firstPairStarts).toEqual([1, 2, 1]);
        expect(secondPairStarts).toEqual([2, 1, 2]);
    });

    it("ne compte les conversions qu’au moment où le symbole converti est dépensé", () => {
        const match = runSimulations({
            games: 1,
            seed: 3992650978,
            maxTurns: 20,
            profile1: "balanced",
            profile2: "support",
        }).matches[0];
        if (!match) throw new Error("Match de test attendu.");

        expect(
            match.history.some(
                (event) =>
                    event.type === "strategy" &&
                    event.description.startsWith("Conversion tactique"),
            ),
        ).toBe(true);

        for (const player of [1, 2] as const) {
            const spentFromActions = { invocation: 0, attack: 0, movement: 0 };
            const conversions = match.history.filter(
                (event) =>
                    event.player === player &&
                    event.type === "strategy" &&
                    event.description.startsWith("Conversion tactique"),
            );
            for (const event of match.history) {
                if (event.player !== player || event.type === "strategy") continue;
                if (
                    event.type === "invocation" ||
                    event.type === "attack" ||
                    event.type === "movement"
                ) {
                    spentFromActions[event.type] += event.cost ?? 0;
                }
            }
            expect(match.statistics[player].symbolsSpent).toEqual(spentFromActions);
            expect(match.statistics[player].conversionLosses).toBe(conversions.length);
        }
    });

    it("évite les conversions répétées vers une ressource déjà suffisante", () => {
        const match = runSimulations({
            games: 1,
            seed: 3992651002,
            maxTurns: 20,
            profile1: "support",
            profile2: "balanced",
        }).matches[0];
        if (!match) throw new Error("Match de test attendu.");
        const conversions = match.history.filter(
            (event) =>
                event.type === "strategy" && event.description.startsWith("Conversion tactique"),
        );

        expect(conversions.length).toBeLessThan(60);
    });

    it("attribue une lettre unique même aux symboles de configuration dupliqués", () => {
        const symbols = getUniqueMonsterSymbols([
            { id: "first", symbol: "Q" },
            { id: "duplicate", symbol: "Q" },
            { id: "multi-letter", symbol: "XY" },
        ]);

        expect([...symbols.values()]).toEqual(["Q", "A", "B"]);
    });

    it("définit une seule lettre distincte par monstre dans la configuration par défaut", () => {
        const symbols = getDefaultGameConfiguration().monsters.map((monster) => monster.symbol);

        expect(symbols.every((symbol) => /^[A-Z]$/.test(symbol))).toBe(true);
        expect(new Set(symbols).size).toBe(symbols.length);
    });

    it("importe les rapports historiques dont les monstres n'ont pas encore de symbole", () => {
        const result = runSimulations({
            games: 1,
            seed: 42,
            maxTurns: 1,
            profile1: "cheap",
            profile2: "offensive",
        });
        const legacyResult = {
            ...result,
            matches: result.matches.map((match) => {
                const { lastMonsterSummonTurn: _lastTurn1, ...player1Stats } = match.statistics[1];
                const { lastMonsterSummonTurn: _lastTurn2, ...player2Stats } = match.statistics[2];
                void _lastTurn1;
                void _lastTurn2;
                return {
                    ...match,
                    statistics: { 1: player1Stats, 2: player2Stats },
                    finalMonsters: match.finalMonsters.map((monster) => {
                        const { symbol, ...legacyMonster } = monster;
                        void symbol;
                        return legacyMonster;
                    }),
                };
            }),
        };

        expect(parseSimulationData(legacyResult)).not.toBeNull();
    });

    it("sélectionne des decks distincts selon les profils économiques et de soutien", () => {
        const monsters = getDefaultGameConfiguration().monsters;
        const cheap = chooseDeck(monsters, "cheap", 5, createRandom(42));
        const expensive = chooseDeck(monsters, "expensive", 5, createRandom(42));
        const support = chooseDeck(monsters, "support", 5, createRandom(42));
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

    it("continue les invocations du profil coûteux au lieu de bloquer sur son ordre de coûts", () => {
        const match = runSimulations(
            {
                games: 1,
                seed: 4009713184,
                maxTurns: 100,
                profile1: "cheap",
                profile2: "expensive",
                deck1: ["swamp-thing", "ghost", "black-knight", "archer", "spectre"],
                deck2: ["archer", "frost-mage"],
            },
            undefined,
            undefined,
            7,
        ).matches[0];
        if (!match) throw new Error("Match de régression attendu.");

        expect(match.startingPlayer).toBe(2);
        expect(match.decks[2]).toEqual(["archer", "frost-mage"]);
        expect(match.statistics[2].summoned).toBeGreaterThan(2);
        expect(match.winner).not.toBeNull();
        expect(match.turns).toBeLessThan(100);
    });

    it("consigne la posture stratégique et l’adaptation au profil adverse", () => {
        const result = runSimulations({
            games: 1,
            seed: 193,
            maxTurns: 1,
            profile1: "balanced",
            profile2: "offensive",
        });
        const decisions = result.matches[0]?.history.filter(
            (event) =>
                event.type === "strategy" && event.description.startsWith("Décision stratégique"),
        );

        expect(decisions).toHaveLength(2);
        expect(decisions?.[0]?.description).toContain("s’adapte au profil « offensive »");
        expect(decisions?.[0]?.description).toContain("renforce son périmètre");
        expect(decisions?.[1]?.description).toContain(
            "priorise les PV de la base adverse sans ignorer les menaces",
        );
    });

    it("traque l’ultime invocation et retire les invocations des dés aux tours suivants", () => {
        const configuration = getDefaultGameConfiguration();
        configuration.maxMonstersPerPlayer = 1;
        configuration.initialPlayerHealth = 20;
        configuration.monstersKilledForVictory = 20;
        configuration.removeInvocationDiceWhenNoMonsters = true;
        configuration.monsters = configuration.monsters.map((monster) => ({
            ...monster,
            cost: 0,
            hp: 50,
            attacks: monster.attacks.map((attack) => ({ ...attack, damage: 0 })),
        }));

        const match = runSimulations(
            {
                games: 1,
                seed: 912,
                maxTurns: 2,
                profile1: "balanced",
                profile2: "balanced",
            },
            configuration,
        ).matches[0];
        if (!match) throw new Error("Match de test attendu.");

        expect(match.statistics[1].lastMonsterSummonTurn).toBe(1);
        expect(match.statistics[2].lastMonsterSummonTurn).toBe(1);
        expect(
            match.history
                .filter((event) => event.type === "dice" && event.turn === 2)
                .every((event) => !event.description.includes("invocation")),
        ).toBe(true);
    });
});
