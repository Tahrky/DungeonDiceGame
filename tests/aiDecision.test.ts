import { describe, expect, it } from "vitest";
import { getStartingPositions, createCustomBoard } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { getInitialAttackCooldowns, getInitialAttackUses } from "../src/game/monsterActions";
import {
    assignMonsterRoles,
    createThreatScores,
    evaluateStrategicState,
    getStrategicCellScore,
} from "../src/game/ai";
import { runCrossProfileTournament, runSimulations } from "../src/simulation/simulator";
import { createStats, type MatchState } from "../src/simulation/matchState";
import type { StrategicSnapshot } from "../src/game/ai";

function createSnapshot(health1: number, health2: number): StrategicSnapshot {
    const board = createCustomBoard(7, 7);
    return {
        board,
        health: { 1: health1, 2: health2 },
        initialHealth: 3,
        monsters: [],
        reserves: {
            1: { invocation: 2, attack: 2, movement: 2 },
            2: { invocation: 1, attack: 1, movement: 1 },
        },
        profile: "defensive",
        tactics: { 1: "defense", 2: "offense" },
        currentPlayer: 1,
        turn: 1,
    };
}

describe("noyau de décision tactique", () => {
    it("repère les cases menacées par une attaque ennemie accessible", () => {
        const configuration = getDefaultGameConfiguration();
        const ghost = configuration.monsters.find((monster) => monster.id === "ghost");
        if (!ghost) throw new Error("Fantôme de test introuvable.");
        const defender = {
            id: "defender",
            monster: ghost,
            owner: 1 as const,
            position: { x: 4, y: 3 },
            facing: "west" as const,
            currentHp: ghost.hp,
            cells: [{ x: 4, y: 3 }],
            summonedOnTurn: 1,
            attacksUsedThisTurn: 0,
            attackUsesThisTurn: getInitialAttackUses(ghost),
            movementsUsedThisTurn: 0,
            attackCooldowns: getInitialAttackCooldowns(ghost),
            statusEffects: [],
        };
        const attacker = {
            ...defender,
            id: "attacker",
            owner: 2 as const,
            position: { x: 3, y: 3 },
            facing: "east" as const,
            cells: [{ x: 3, y: 3 }],
        };

        const threats = createThreatScores(createCustomBoard(7, 7), [defender, attacker], defender.id);

        expect(threats.get("4,3")).toBeGreaterThan(0);
        expect(threats.has("4,4")).toBe(false);
    });

    it("pénalise une base proche de la destruction", () => {
        const endangered = evaluateStrategicState(createSnapshot(1, 3));
        const stable = evaluateStrategicState(createSnapshot(3, 3));
        expect(endangered).toBeLessThan(stable);
    });

    it("valorise une position défensive proche du périmètre", () => {
        const snapshot = createSnapshot(3, 3);
        const starts = getStartingPositions(snapshot.board);
        const perimeter = { x: starts[1].x + 3, y: starts[1].y };
        const farCorner = { x: snapshot.board.width - 1, y: snapshot.board.height - 1 };
        expect(getStrategicCellScore(snapshot, 1, perimeter)).toBeGreaterThan(
            getStrategicCellScore(snapshot, 1, farCorner),
        );
    });

    it("fait avancer les défenseurs lorsque leur base n’est pas menacée", () => {
        const configuration = getDefaultGameConfiguration();
        const monster = configuration.monsters.find((candidate) => candidate.id === "ghost");
        if (!monster) throw new Error("Monstre de test introuvable.");
        const snapshot = createSnapshot(3, 3);
        const starts = getStartingPositions(snapshot.board);
        const defender = {
            id: "defender",
            monster,
            owner: 1 as const,
            position: { x: starts[1].x + 1, y: starts[1].y },
            facing: "east" as const,
            currentHp: monster.hp,
            cells: [{ x: starts[1].x + 1, y: starts[1].y }],
            summonedOnTurn: 1,
            attacksUsedThisTurn: 0,
            attackUsesThisTurn: getInitialAttackUses(monster),
            movementsUsedThisTurn: 0,
            attackCooldowns: getInitialAttackCooldowns(monster),
            statusEffects: [],
        };
        const safeSnapshot = { ...snapshot, monsters: [defender] };
        const threatenedSnapshot = {
            ...safeSnapshot,
            monsters: [
                ...safeSnapshot.monsters,
                {
                    ...defender,
                    id: "threat",
                    owner: 2 as const,
                    position: { x: starts[1].x + 2, y: starts[1].y },
                },
            ],
        };

        expect(assignMonsterRoles(safeSnapshot, 1)[0]?.target).toEqual(starts[2]);
        expect(assignMonsterRoles(threatenedSnapshot, 1)[0]?.target).toEqual(starts[1]);
    });

    it("fait avancer les monstres de soutien si aucun allié n’est blessé", () => {
        const configuration = getDefaultGameConfiguration();
        const monster = configuration.monsters.find((candidate) =>
            candidate.attacks.some((attack) => attack.targetsAlliesOnly),
        );
        if (!monster) throw new Error("Monstre de soutien de test introuvable.");
        const snapshot = createSnapshot(3, 3);
        const starts = getStartingPositions(snapshot.board);
        const supporter = {
            id: "supporter",
            monster,
            owner: 1 as const,
            position: { x: starts[1].x + 1, y: starts[1].y },
            facing: "east" as const,
            currentHp: monster.hp,
            cells: [{ x: starts[1].x + 1, y: starts[1].y }],
            summonedOnTurn: 1,
            attacksUsedThisTurn: 0,
            attackUsesThisTurn: getInitialAttackUses(monster),
            movementsUsedThisTurn: 0,
            attackCooldowns: getInitialAttackCooldowns(monster),
            statusEffects: [],
        };
        const allyMonster = configuration.monsters.find((candidate) => candidate.id === "ghost");
        if (!allyMonster) throw new Error("Monstre allié de test introuvable.");
        const ally = {
            ...supporter,
            id: "ally",
            monster: allyMonster,
            position: { x: starts[1].x + 2, y: starts[1].y },
            cells: [{ x: starts[1].x + 2, y: starts[1].y }],
            currentHp: allyMonster.hp,
            attackUsesThisTurn: getInitialAttackUses(allyMonster),
            attackCooldowns: getInitialAttackCooldowns(allyMonster),
        };
        const supportSnapshot = {
            ...snapshot,
            profile: "support" as const,
            tactics: { 1: "balanced" as const, 2: "balanced" as const },
            monsters: [supporter, ally],
        };

        expect(assignMonsterRoles(supportSnapshot, 1)).toContainEqual({
            monsterId: "supporter",
            role: "base",
            target: starts[2],
        });
    });

    it("active les détails de debug uniquement sur demande", () => {
        const normal = runSimulations({
            games: 1,
            seed: 42,
            maxTurns: 1,
            profile1: "balanced",
            profile2: "offensive",
        });
        const debug = runSimulations({
            games: 1,
            seed: 193,
            maxTurns: 5,
            profile1: "balanced",
            profile2: "offensive",
            debug: true,
        });

        expect(normal.matches[0]?.history.some((event) => event.debug)).toBe(false);
        expect(debug.matches[0]?.history.some((event) => event.debug)).toBe(true);
    });

    it("produit un tournoi croisé reproductible des sept profils", () => {
        const tournament = runCrossProfileTournament({
            games: 1,
            seed: 101,
            maxTurns: 1,
        });
        expect(tournament).toHaveLength(49);
        expect(
            new Set(
                tournament.map(
                    (match) =>
                        `${match.profile1}-${match.profile2}-${match.result.matches[0]?.seed}`,
                ),
            ).size,
        ).toBe(49);
    }, 600_000);

    it("sépare réellement profondeur, largeur de branches et budget de recherche", () => {
        const shallow = runSimulations({
            games: 2,
            seed: 808,
            maxTurns: 3,
            profile1: "balanced",
            profile2: "tracker",
            advanced: true,
            searchDepth: 1,
            branchWidth: 3,
            nodeBudget: 120,
            lightResults: true,
        });
        const deep = runSimulations({
            games: 2,
            seed: 808,
            maxTurns: 3,
            profile1: "balanced",
            profile2: "tracker",
            advanced: true,
            searchDepth: 3,
            branchWidth: 8,
            nodeBudget: 600,
            lightResults: true,
        });

        const shallowStats = shallow.matches[0]?.statistics[1];
        const deepStats = deep.matches[0]?.statistics[1];
        expect(shallowStats?.maxSearchDepthReached).toBe(1);
        expect(deepStats?.maxSearchDepthReached).toBe(3);
        expect(deepStats?.branchesExplored).toBeGreaterThanOrEqual(
            shallowStats?.branchesExplored ?? 0,
        );
        expect(deep.matches.map((match) => match.seed)).toEqual(
            shallow.matches.map((match) => match.seed),
        );
    });

    it("initialise les statistiques de ressources sans confondre réserves et dépenses", () => {
        const configuration = getDefaultGameConfiguration();
        const monster = configuration.monsters[0];
        if (!monster) throw new Error("Monstre attendu.");
        const state: MatchState = {
            turn: 1,
            currentPlayer: 1,
            profiles: { 1: "balanced", 2: "offensive" },
            tactics: { 1: "balanced", 2: "offense" },
            allowBaseAttackOnSummonTurn: true,
            health: { 1: 3, 2: 3 },
            reserves: {
                1: { invocation: 1, attack: 1, movement: 1 },
                2: { invocation: 0, attack: 0, movement: 0 },
            },
            monsters: [
                {
                    id: "placed",
                    monster,
                    owner: 1,
                    position: { x: 1, y: 1 },
                    facing: "east",
                    currentHp: monster.hp,
                    cells: [{ x: 1, y: 1 }],
                    summonedOnTurn: 1,
                    attacksUsedThisTurn: 0,
                    attackUsesThisTurn: getInitialAttackUses(monster),
                    movementsUsedThisTurn: 0,
                    attackCooldowns: getInitialAttackCooldowns(monster),
                    statusEffects: [],
                },
            ],
            history: [],
            winner: null,
            finishReason: "turnLimit",
            statistics: { 1: createStats(), 2: createStats() },
            nextMonsterId: 2,
            monstersKilledForVictory: configuration.monstersKilledForVictory,
        };
        expect(state.statistics[1].monstersLost).toBe(0);
        expect(state.statistics[1].symbolsSpent).toEqual({
            invocation: 0,
            attack: 0,
            movement: 0,
        });
    });
});
