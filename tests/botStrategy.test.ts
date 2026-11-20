import { describe, expect, it } from "vitest";
import {
    canDeployMonsterForProfile,
    chooseBotTactic,
    chooseBotObjective,
    chooseSymbolConversion,
    chooseDeck,
    findObjectiveMovement,
    scoreDefensivePlacement,
    createPathBlockadeScorer,
    createTerritoryExpansionScorer,
    scoreTacticalAttack,
    scoreTerritoryExpansion,
    parseBotStrategyWeightMap,
    DEFAULT_BOT_STRATEGY_WEIGHTS,
    scoreMonsterForProfile,
} from "../src/game/botStrategy";
import type { MovementOptions } from "../src/game/monsterActions";
import type { TacticalAttackValue } from "../src/game/botStrategy";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import type { Position } from "../src/types/GameTypes";

function createRandom(seed: number): () => number {
    let value = seed;
    return () => {
        value = (value * 1664525 + 1013904223) >>> 0;
        return value / 0x1_0000_0000;
    };
}

function getReferenceRouteLength(
    boardWidth: number,
    boardHeight: number,
    ownBase: Position,
    enemyBase: Position,
    blockedCells: readonly Position[],
): number | null {
    const ownBaseKey = `${ownBase.x},${ownBase.y}`;
    const enemyBaseKey = `${enemyBase.x},${enemyBase.y}`;
    const blocked = new Set(
        blockedCells
            .filter(
                ({ x, y }) =>
                    x >= 0 &&
                    y >= 0 &&
                    x < boardWidth &&
                    y < boardHeight &&
                    `${x},${y}` !== ownBaseKey &&
                    `${x},${y}` !== enemyBaseKey,
            )
            .map(({ x, y }) => `${x},${y}`),
    );
    const distances = new Map<string, number>([[enemyBaseKey, 0]]);
    const queue = [enemyBase];

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
        const current = queue[queueIndex]!;
        const currentKey = `${current.x},${current.y}`;
        if (currentKey === ownBaseKey) return distances.get(currentKey)!;

        const nextDistance = distances.get(currentKey)! + 1;
        const neighbors = [
            { x: current.x - 1, y: current.y },
            { x: current.x + 1, y: current.y },
            { x: current.x, y: current.y - 1 },
            { x: current.x, y: current.y + 1 },
        ];
        for (const neighbor of neighbors) {
            const key = `${neighbor.x},${neighbor.y}`;
            if (
                neighbor.x < 0 ||
                neighbor.y < 0 ||
                neighbor.x >= boardWidth ||
                neighbor.y >= boardHeight ||
                blocked.has(key) ||
                distances.has(key)
            ) {
                continue;
            }
            distances.set(key, nextDistance);
            queue.push(neighbor);
        }
    }

    return null;
}

function getReferencePathBlockadeScore(
    boardWidth: number,
    boardHeight: number,
    ownBase: Position,
    enemyBase: Position,
    ownPathCells: readonly Position[],
    blockedCells: readonly Position[],
    candidateCells: readonly Position[],
): number {
    const fixedBlocks = [...ownPathCells, ...blockedCells];
    const currentRouteLength = getReferenceRouteLength(
        boardWidth,
        boardHeight,
        ownBase,
        enemyBase,
        fixedBlocks,
    );
    if (currentRouteLength === null) return 0;

    const nextRouteLength = getReferenceRouteLength(boardWidth, boardHeight, ownBase, enemyBase, [
        ...fixedBlocks,
        ...candidateCells,
    ]);
    if (nextRouteLength === null) return 500;
    return Math.max(0, nextRouteLength - currentRouteLength) * 80;
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

    it("évite une case menacée quand une progression équivalente est disponible", () => {
        const cells = [
            { x: 2, y: 2 },
            { x: 3, y: 2 },
            { x: 2, y: 3 },
        ];
        const options: MovementOptions = {
            source: cells[0]!,
            destination: cells[0]!,
            deployedCells: cells,
            occupiedCells: [],
            blockedCells: [],
            range: 1,
            boardWidth: 7,
            boardHeight: 7,
        };

        expect(
            findObjectiveMovement(
                options,
                cells,
                { x: 5, y: 3 },
                [],
                "balanced",
                new Map([["3,2", 10]]),
            ),
        ).toMatchObject({
            position: { x: 2, y: 3 },
            routeProgress: 1,
        });
    });

    it("permet de régler la valeur offensive des monstres", () => {
        const ghost = getDefaultGameConfiguration().monsters.find(
            (monster) => monster.id === "ghost",
        );
        if (!ghost) throw new Error("Monstre de test introuvable.");

        expect(
            scoreMonsterForProfile(ghost, "offensive", {
                ...DEFAULT_BOT_STRATEGY_WEIGHTS,
                monsterOffense: 1.5,
            }),
        ).toBeGreaterThan(scoreMonsterForProfile(ghost, "offensive"));
    });

    it("continue vers l’objectif au-delà de la frontière de son territoire", () => {
        const deployedCells = [
            { x: 14, y: 7 },
            { x: 15, y: 7 },
            { x: 16, y: 7 },
        ];
        const options: MovementOptions = {
            source: deployedCells[0]!,
            destination: deployedCells[0]!,
            deployedCells,
            occupiedCells: [],
            blockedCells: [],
            range: 1,
            boardWidth: 19,
            boardHeight: 15,
        };

        expect(findObjectiveMovement(options, [deployedCells[0]!], { x: 18, y: 7 })).toMatchObject({
            position: { x: 15, y: 7 },
            routeProgress: -1,
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

    it("préserve le score d’expansion avec un calcul précompilé", () => {
        const ownedCells = [
            { x: 7, y: 1 },
            { x: 6, y: 1 },
        ];
        const candidates = [
            { x: 5, y: 2 },
            { x: 5, y: 3 },
            { x: 6, y: 2 },
        ];
        for (const player of [1, 2] as const) {
            const startingPosition = player === 1 ? { x: 0, y: 1 } : { x: 7, y: 1 };
            const enemyStartingPosition = player === 1 ? { x: 7, y: 1 } : { x: 0, y: 1 };
            const score = createTerritoryExpansionScorer(
                player,
                ownedCells,
                startingPosition,
                enemyStartingPosition,
            );

            expect(score(candidates)).toBe(
                scoreTerritoryExpansion(
                    player,
                    candidates,
                    ownedCells,
                    startingPosition,
                    enemyStartingPosition,
                ),
            );
        }
    });

    it("valorise un chemin qui allonge la route adverse vers sa base", () => {
        const scoreBlockade = createPathBlockadeScorer(
            7,
            7,
            { x: 6, y: 3 },
            { x: 0, y: 3 },
            [],
            [],
        );

        expect(scoreBlockade([{ x: 3, y: 3 }])).toBeGreaterThan(scoreBlockade([{ x: 1, y: 1 }]));
        expect(scoreBlockade([{ x: 3, y: 3 }])).toBe(160);
    });

    it("détecte une route coupée sans confondre les cases hors plateau", () => {
        const scoreBlockade = createPathBlockadeScorer(
            7,
            7,
            { x: 6, y: 3 },
            { x: 0, y: 3 },
            [],
            [],
        );

        expect(
            scoreBlockade([
                { x: 5, y: 3 },
                { x: 6, y: 2 },
                { x: 6, y: 4 },
            ]),
        ).toBe(500);
        expect(scoreBlockade([{ x: 7, y: 0 }])).toBe(0);
    });

    it("préserve les scores de route pour détours, obstacles et routes coupées", () => {
        const scenarios = [
            {
                boardWidth: 7,
                boardHeight: 7,
                ownBase: { x: 6, y: 3 },
                enemyBase: { x: 0, y: 3 },
                ownPathCells: [],
                blockedCells: [],
                candidates: [
                    [{ x: 1, y: 1 }],
                    [{ x: 3, y: 3 }],
                    [
                        { x: 5, y: 3 },
                        { x: 6, y: 2 },
                        { x: 6, y: 4 },
                    ],
                    [{ x: 7, y: 0 }],
                    [{ x: 6, y: 3 }],
                ],
            },
            {
                boardWidth: 11,
                boardHeight: 7,
                ownBase: { x: 10, y: 3 },
                enemyBase: { x: 0, y: 3 },
                ownPathCells: [
                    { x: 3, y: 3 },
                    { x: 4, y: 3 },
                ],
                blockedCells: [
                    { x: 5, y: 2 },
                    { x: 5, y: 4 },
                ],
                candidates: [
                    [{ x: 5, y: 3 }],
                    [
                        { x: 8, y: 2 },
                        { x: 9, y: 2 },
                        { x: 9, y: 3 },
                    ],
                    [{ x: 5, y: 5 }],
                ],
            },
        ];

        for (const scenario of scenarios) {
            const scoreBlockade = createPathBlockadeScorer(
                scenario.boardWidth,
                scenario.boardHeight,
                scenario.ownBase,
                scenario.enemyBase,
                scenario.ownPathCells,
                scenario.blockedCells,
            );
            for (const candidates of scenario.candidates) {
                expect(scoreBlockade(candidates)).toBe(
                    getReferencePathBlockadeScore(
                        scenario.boardWidth,
                        scenario.boardHeight,
                        scenario.ownBase,
                        scenario.enemyBase,
                        scenario.ownPathCells,
                        scenario.blockedCells,
                        candidates,
                    ),
                );
            }
        }
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
        expect(scoreTacticalAttack({ ...damage, baseDamage: 1 }, 1, "tracker", 1)).toBeGreaterThan(
            scoreTacticalAttack(finishingBlow, 1, "tracker", 1),
        );
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

    it("applique les poids tactiques configurés et rejette les poids hors bornes", () => {
        const attack: TacticalAttackValue = {
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
        const weighted = {
            ...DEFAULT_BOT_STRATEGY_WEIGHTS,
            damage: 1.5,
        };

        expect(scoreTacticalAttack(attack, 1, "balanced", 3, undefined, weighted)).toBeGreaterThan(
            scoreTacticalAttack(attack, 1, "balanced", 3),
        );
        expect(parseBotStrategyWeightMap({ balanced: { damage: 1.5 } })).toEqual({
            balanced: weighted,
        });
        expect(parseBotStrategyWeightMap({ balanced: { damage: 2.1 } })).toBeNull();
        expect(parseBotStrategyWeightMap({ unknown: { damage: 1 } })).toBeNull();
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

    it("privilégie une progression de coût au profil coûteux sans raccourcir son deck", () => {
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
        expect(deck).toHaveLength(5);
        expect(deck[0]).toBeGreaterThanOrEqual(2);
        expect(deck[0]).toBeLessThanOrEqual(3);
        expect(deck[1]).toBeGreaterThan(deck[0]!);
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
