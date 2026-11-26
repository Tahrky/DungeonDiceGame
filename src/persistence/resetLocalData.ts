import { DECK_STORAGE_KEY } from "../game/decks";
import { GAME_CONFIGURATION_STORAGE_KEY } from "../game/gameConfiguration";
import { clearAllRecoveryData } from "./indexedDb";
import { clearRecoveryScreen } from "./recoveryScreen";

export async function resetLocalData(): Promise<void> {
    await clearAllRecoveryData();
    localStorage.removeItem(DECK_STORAGE_KEY);
    localStorage.removeItem(GAME_CONFIGURATION_STORAGE_KEY);
    clearRecoveryScreen();
}
