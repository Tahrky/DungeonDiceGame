import { describe, expect, it } from "vitest";
import {
    chooseBotObjective,
    chooseSymbolConversion,
    chooseDeck,
    findObjectiveMovement,
    scoreTacticalAttack,
    scoreTerritoryExpansion,
} from "../src/game/botStrategy";
import type { MovementOptions } from "../src/game/monsterActions";
import type { TacticalAttackValue } from "../src/game/botStrategy";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";

function createRandom(seed: number): () => number {
    let value = seed;
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 0x1_0000_0000;
    };
}

describe("stratégie des bots", () => {
    it("choisit des routes qui rapprochent le monstre de la base malgré un détour", () => {
        const cells = [
            { x: 2, y: 2 },
            { x: 3, y: 2 },
            { x: 3, y: 1 },
            { x: 3, y: 0 },
        ];
        const options: MovementOptions = {
            source: cells[0]!,
            destination: cells[0]!,
            deployedCells: cells,
            occupiedCells: [],
            blockedCells: [],
            range: 1,
            boardWidth: 5,
            boardHeight: 5,
        };

        expect(findObjectiveMovement(options, cells, { x: 0, y: 0 })).toMatchObject({
            position: { x: 3, y: 2 },
            routeProgress: 1,
        });
    });

    it("se repositionne vers un ennemi quand la route vers la base est à égalité", () => {
        const cells = [
            { x: 2, y: 2 },
            { x: 3, y: 2 },
            { x: 3, y: 1 },
        ];
        const options: MovementOptions = {
            source: cells[0]!,
            destination: cells[0]!,
            deployedCells: cells,
            occupiedCells: [],
            blockedCells: [],
            range: 2,
            boardWidth: 5,
            boardHeight: 5,
        };

        expect(
            findObjectiveMovement(options, cells, { x: 0, y: 0 }, [{ x: 4, y: 1 }]),
        ).toMatchObject({
            position: { x: 3, y: 1 },
            routeProgress: 0,
        });
    });

    it("étend le territoire vers la base adverse plutôt que latéralement à l’opposé", () => {
        const owned = [{ x: 7, y: 1 }];
        const start = { x: 7, y: 1 };
        const enemyBase = { x: 1, y: 1 };
        const towardBase = scoreTerritoryExpansion(
            2,
            [{ x: 5, y: 2 }],
            owned,
            start,
            enemyBase,
        );
        const awayFromBase = scoreTerritoryExpansion(
            2,
            [{ x: 5, y: 5 }],
            owned,
            start,
            enemyBase,
        );

        expect(towardBase).toBeGreaterThan(awayFromBase);
    });

    it("valorise les attaques décisives et respecte les profils", () => {
        const damage: TacticalAttackValue = {
            damage: 2,
            kills: 0,
            statusDamage: 0,
            baseDamage: 0,
            healing: 0,
            clearedEffects: 0,
            buffs: 0,
            cooldownsReduced: 0,
            friendlyDamage: 0,
        };
        const finishingBlow = { ...damage, kills: 1 };
        const support: TacticalAttackValue = { ...damage, healing: 2 };

        expect(scoreTacticalAttack(finishingBlow, 1, "offensive", 3)).toBeGreaterThan(
            scoreTacticalAttack(damage, 1, "offensive", 3),
        );
        expect(scoreTacticalAttack(support, 1, "support", 3)).toBeGreaterThan(
            scoreTacticalAttack(support, 1, "balanced", 3),
        );
        expect(scoreTacticalAttack(finishingBlow, 1, "defensive", 3)).toBeGreaterThan(
            scoreTacticalAttack({ ...damage, baseDamage: 1 }, 1, "defensive", 3),
        );
    });

    it("sélectionne des decks distincts selon les profils", () => {
        const monsters = getDefaultGameConfiguration().monsters;
        const offensive = chooseDeck(monsters, "offensive", 5, createRandom(42));
        const support = chooseDeck(monsters, "support", 5, createRandom(42));

        expect(offensive).not.toEqual(support);
    });

    it("le profil défensif cible les monstres adverses plutôt que la base", () => {
        const source = { x: 5, y: 5 };
        const enemyBase = { x: 0, y: 5 };
        const enemies = [{ x: 4, y: 5 }, { x: 8, y: 5 }];

        expect(chooseBotObjective("defensive", source, enemyBase, enemies)).toEqual(enemies[0]);
        expect(chooseBotObjective("offensive", source, enemyBase, enemies)).toEqual(enemyBase);
        expect(chooseBotObjective("defensive", source, enemyBase, [])).toEqual(enemyBase);
    });

    it("varie les decks entre les simulations tout en gardant un biais de profil", () => {
        const monsters = getDefaultGameConfiguration().monsters;
        const decks = Array.from({ length: 20 }, (_, seed) =>
            chooseDeck(monsters, "balanced", 5, createRandom(seed + 1)),
        );
        const deployedMonsterIds = new Set(decks.flat());

        expect(new Set(decks.map((deck) => deck.join(","))).size).toBeGreaterThan(1);
        expect(deployedMonsterIds.size).toBeGreaterThan(5);
    });

    it("convertit des symboles excédentaires pour débloquer la meilleure action", () => {
        expect(
            chooseSymbolConversion(
                { invocation: 0, attack: 3, movement: 2 },
                { invocation: 5, attack: 4, movement: 3 },
                { invocation: 0, attack: 1, movement: 1 },
            ),
        ).toMatchObject({ targetSymbol: "invocation" });
    });

    it("évite une conversion qui empêcherait une action déjà accessible", () => {
        expect(
            chooseSymbolConversion(
                { invocation: 0, attack: 1, movement: 1 },
                { invocation: 5, attack: 0, movement: 0 },
                { invocation: 0, attack: 1, movement: 1 },
            ),
        ).toBeNull();
    });
});
