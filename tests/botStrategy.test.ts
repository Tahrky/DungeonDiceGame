import { describe, expect, it } from "vitest";
import {
    chooseDeck,
    findObjectiveMovement,
    scoreTacticalAttack,
    scoreTerritoryExpansion,
} from "../src/game/botStrategy";
import type { MovementOptions } from "../src/game/monsterActions";
import type { TacticalAttackValue } from "../src/game/botStrategy";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";

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
    });

    it("sélectionne des decks distincts selon les profils", () => {
        const monsters = getDefaultGameConfiguration().monsters;
        const offensive = chooseDeck(monsters, "offensive", 5);
        const support = chooseDeck(monsters, "support", 5);

        expect(offensive).not.toEqual(support);
    });
});
