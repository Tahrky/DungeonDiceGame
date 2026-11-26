import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/persistence/indexedDb", () => ({
    clearAllRecoveryData: vi.fn(),
}));

import { DECK_STORAGE_KEY } from "../src/game/decks";
import { GAME_CONFIGURATION_STORAGE_KEY } from "../src/game/gameConfiguration";
import { clearAllRecoveryData } from "../src/persistence/indexedDb";
import { resetLocalData } from "../src/persistence/resetLocalData";

function createStorage(values: Record<string, string>) {
    const data = new Map(Object.entries(values));
    return {
        getItem: (key: string) => data.get(key) ?? null,
        removeItem: (key: string) => data.delete(key),
    };
}

afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllGlobals();
});

describe("effacement des données locales", () => {
    it("efface les sauvegardes du jeu sans toucher aux autres données", async () => {
        const local = createStorage({
            [DECK_STORAGE_KEY]: "deck",
            [GAME_CONFIGURATION_STORAGE_KEY]: "configuration",
            unrelated: "conserver",
        });
        const session = createStorage({
            "dungeon-dice.recovery-session-id": "session",
            "dungeon-dice.active-screen": "game",
            unrelated: "conserver",
        });
        vi.stubGlobal("localStorage", local);
        vi.stubGlobal("sessionStorage", session);

        await resetLocalData();

        expect(clearAllRecoveryData).toHaveBeenCalledOnce();
        expect(local.getItem(DECK_STORAGE_KEY)).toBeNull();
        expect(local.getItem(GAME_CONFIGURATION_STORAGE_KEY)).toBeNull();
        expect(session.getItem("dungeon-dice.recovery-session-id")).toBeNull();
        expect(session.getItem("dungeon-dice.active-screen")).toBeNull();
        expect(local.getItem("unrelated")).toBe("conserver");
        expect(session.getItem("unrelated")).toBe("conserver");
    });

    it("signale une erreur de stockage sans supprimer les préférences", async () => {
        const local = createStorage({ [DECK_STORAGE_KEY]: "deck" });
        vi.stubGlobal("localStorage", local);
        vi.mocked(clearAllRecoveryData).mockRejectedValueOnce(new Error("Stockage indisponible"));

        await expect(resetLocalData()).rejects.toThrow("Stockage indisponible");
        expect(local.getItem(DECK_STORAGE_KEY)).toBe("deck");
    });

    it("signale un échec même après effacement des sauvegardes de reprise", async () => {
        vi.stubGlobal("localStorage", {
            removeItem: () => {
                throw new Error("Accès refusé");
            },
        });

        await expect(resetLocalData()).rejects.toThrow("Accès refusé");
        expect(clearAllRecoveryData).toHaveBeenCalledOnce();
    });
});
