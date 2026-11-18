import { describe, expect, it } from "vitest";
import {
    canDeployMonsterForProfile,
    chooseBotTactic,
    chooseBotObjective,
    chooseSymbolConversion,
    chooseDeck,
    findObjectiveMovement,
    scoreDefensivePlacement,
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
            findObjectiveMovement(options, cells, { x: 0, y: 0 }, [{ x: 4, y: 1 }], "hunt"),
        ).toMatchObject({
            position: { x: 3, y: 1 },
            routeProgress: 0,
        });
    });

    it("étend le territoire vers la base adverse plutôt que latéralement à l’opposé", () => {
        const owned = [{ x: 7, y: 1 }];
        const start = { x: 7, y: 1 };
        const enemyBase = { x: 1, y: 1 };
        const towardBase = scoreTerritoryExpansion(2, [{ x: 5, y: 2 }], owned, start, enemyBase);
        const awayFromBase = scoreTerritoryExpansion(2, [{ x: 5, y: 5 }], owned, start, enemyBase);

        expect(towardBase).toBeGreaterThan(awayFromBase);
    });

    it("applique les priorités de victoire et respecte les profils", () => {
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

        expect(scoreTacticalAttack(finishingBlow, 1, "offensive", 3, "offensive")).toBeGreaterThan(
            scoreTacticalAttack(damage, 1, "offensive", 3, "offensive"),
        );
        expect(scoreTacticalAttack(damage, 1, "offensive", 3, "offensive")).toBeGreaterThan(0);
        expect(
            scoreTacticalAttack({ ...damage, baseDamage: 1 }, 1, "offensive", 3, "offensive"),
        ).toBeGreaterThan(scoreTacticalAttack(finishingBlow, 1, "offensive", 3, "offensive"));
        expect(scoreTacticalAttack(finishingBlow, 1, "tracker", 3)).toBeGreaterThan(
            scoreTacticalAttack({ ...damage, baseDamage: 1 }, 1, "tracker", 3),
        );
        expect(scoreTacticalAttack(support, 1, "support", 3)).toBeGreaterThan(
            scoreTacticalAttack(support, 1, "balanced", 3),
        );
        expect(scoreTacticalAttack({ ...damage, baseDamage: 1 }, 1, "tracker", 3)).toBeGreaterThan(
            0,
        );
        expect(scoreTacticalAttack(support, 1, "balanced", 3, "support")).toBeGreaterThan(
            scoreTacticalAttack(support, 1, "balanced", 3, "balanced"),
        );
        expect(
            scoreTacticalAttack({ ...damage, baseDamage: 1 }, 1, "defensive", 3),
        ).toBeGreaterThan(0);
    });

    it("sélectionne des decks distincts selon les profils", () => {
        const monsters = getDefaultGameConfiguration().monsters;
        const offensive = chooseDeck(monsters, "offensive", 5, createRandom(42));
        const support = chooseDeck(monsters, "support", 5, createRandom(42));

        expect(offensive).not.toEqual(support);
    });

    it("adapte les profils flexibles sans modifier les stratégies de référence", () => {
        expect(chooseBotTactic("balanced", "offensive").tactic).toBe("defense");
        expect(chooseBotTactic("support", "tracker").tactic).toBe("offense");
        expect(chooseBotTactic("expensive", "defensive").tactic).toBe("balanced");
        expect(chooseBotTactic("offensive", "tracker").tactic).toBe("offense");
        expect(chooseBotTactic("tracker", "offensive").tactic).toBe("hunt");
        expect(chooseBotTactic("defensive", "tracker").tactic).toBe("defense");
    });

    it("impose une progression de coût au profil coûteux", () => {
        const monsters = getDefaultGameConfiguration().monsters;
        const costOne = monsters.find((monster) => monster.cost === 1)!;
        const costThree = monsters.find((monster) => monster.cost === 3)!;
        const costFour = monsters.find((monster) => monster.cost === 4)!;

        expect(canDeployMonsterForProfile(costOne, "expensive", [])).toBe(false);
        expect(canDeployMonsterForProfile(costThree, "expensive", [])).toBe(true);
        expect(canDeployMonsterForProfile(costFour, "expensive", [3])).toBe(true);
        expect(canDeployMonsterForProfile(costThree, "expensive", [3])).toBe(false);
        const deck = chooseDeck(monsters, "expensive", 5, createRandom(42)).map(
            (id) => monsters.find((monster) => monster.id === id)!.cost,
        );
        expect(deck[0]).toBeGreaterThanOrEqual(2);
        expect(deck[0]).toBeLessThanOrEqual(3);
        expect(deck.every((cost, index) => index === 0 || cost > deck[index - 1]!)).toBe(true);
    });

    it("place le périmètre défensif sur une ligne de vue ennemie vers la base", () => {
        expect(
            scoreDefensivePlacement({ x: 2, y: 0 }, { x: 4, y: 0 }, [{ x: 0, y: 0 }], []),
        ).toBeGreaterThan(0);
    });

    it("distingue la traque du périmètre défensif", () => {
        const source = { x: 5, y: 5 };
        const enemyBase = { x: 0, y: 5 };
        const ownBase = { x: 9, y: 5 };
        const enemies = [
            { x: 4, y: 5 },
            { x: 8, y: 5 },
        ];

        expect(chooseBotObjective("tracker", source, enemyBase, enemies, ownBase)).toEqual(
            enemies[0],
        );
        expect(chooseBotObjective("offensive", source, enemyBase, enemies)).toEqual(enemyBase);
        expect(chooseBotObjective("defensive", source, enemyBase, enemies, ownBase)).toEqual(
            ownBase,
        );
        expect(
            chooseBotObjective("defensive", source, enemyBase, [{ x: 3, y: 5 }], ownBase),
        ).toEqual(enemyBase);
        expect(chooseBotObjective("tracker", source, enemyBase, [], ownBase)).toEqual(enemyBase);
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
