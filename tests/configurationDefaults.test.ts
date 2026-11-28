import { afterEach, describe, expect, it, vi } from "vitest";

const simulationDefaults = vi.hoisted(() => {
    function initialSeed(): number | null {
        return null;
    }

    return {
        profile1: "tracker",
        profile2: "defensive",
        crossProfileMode: true,
        gameCount: 42,
        repetitionCount: 3,
        seed: initialSeed(),
        maxTurns: 47,
        debug: true,
        recordDecisionTraces: true,
        expectiminimax: true,
        expectiminimaxMaxDepth: 2,
        expectiminimaxBranchWidth: 5,
        expectiminimaxNodeBudget: 250,
        simulationMode: "classic",
        engine1: "heuristic",
        engine2: "heuristic",
    };
});

vi.mock("../src/data/configuration", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../src/data/configuration")>();
    return {
        ...actual,
        GAME_OPTIONS: {
            ...actual.GAME_OPTIONS,
            protectFirstDeployment: { default: false },
        },
        DEFAULT_BOARD_PRESET_ID: "tall-arena",
        SIMULATION_DEFAULTS: simulationDefaults,
        SIMULATION_CLI_DEFAULTS: { games: 12, profile: "support" },
    };
});

import { createInitialFormValues } from "../src/components/simulation/simulationForm";
import { getBoardPresets, getDefaultBoard } from "../src/game/boards";
import { getDefaultGameConfiguration } from "../src/game/gameConfiguration";
import { parseSimulationArguments } from "../src/simulation/cli/arguments";

afterEach(() => {
    simulationDefaults.seed = null;
    vi.restoreAllMocks();
});

describe("configuration centralisée", () => {
    it("utilise les règles et le plateau par défaut sans renommer les plateaux", () => {
        expect(getDefaultGameConfiguration().protectFirstDeployment).toBe(false);
        expect(getDefaultBoard().id).toBe("tall-arena");
        expect(getBoardPresets().map((board) => board.id)).toEqual([
            "wide-arena",
            "tall-arena",
            "square-arena",
            "bastion",
        ]);
    });

    it("applique les réglages et cases du formulaire, avec une seed dynamique", () => {
        vi.spyOn(Date, "now").mockReturnValue(123456);
        expect(createInitialFormValues()).toEqual({
            profile1: "tracker",
            profile2: "defensive",
            crossProfileMode: true,
            gameCount: "42",
            repetitionCount: "3",
            seed: "123456",
            maxTurns: "47",
            debug: true,
            recordDecisionTraces: true,
            expectiminimax: true,
            expectiminimaxMaxDepth: "2",
            expectiminimaxBranchWidth: "5",
            expectiminimaxNodeBudget: "250",
            simulationMode: "classic",
            engine1: "heuristic",
            engine2: "heuristic",
        });
    });

    it("respecte une seed fixe et les défauts distincts de la CLI", () => {
        simulationDefaults.seed = 987;
        vi.spyOn(Date, "now").mockReturnValue(123456);
        expect(createInitialFormValues().seed).toBe("987");
        const { options } = parseSimulationArguments([], getDefaultGameConfiguration());
        expect(options).toMatchObject({
            games: 12,
            seed: 987,
            maxTurns: 47,
            profile1: "support",
            profile2: "support",
        });
        simulationDefaults.seed = null;
        expect(parseSimulationArguments([], getDefaultGameConfiguration()).options.seed).toBe(123456);
        expect(parseSimulationArguments(["--seed", "99"], getDefaultGameConfiguration()).options.seed).toBe(99);
    });
});
