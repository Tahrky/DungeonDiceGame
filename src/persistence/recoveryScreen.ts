const SESSION_ID_KEY = "dungeon-dice.recovery-session-id";
const ACTIVE_SCREEN_KEY = "dungeon-dice.active-screen";

export type RecoverableScreen = "game" | "simulation";

export function getRecoverySessionId(): string {
    const storedId = sessionStorage.getItem(SESSION_ID_KEY);
    if (storedId) return storedId;

    const sessionId = crypto.randomUUID();
    sessionStorage.setItem(SESSION_ID_KEY, sessionId);
    return sessionId;
}

export function getRecoverableScreen(): RecoverableScreen | null {
    const screen = sessionStorage.getItem(ACTIVE_SCREEN_KEY);
    return screen === "game" || screen === "simulation" ? screen : null;
}

export function saveActiveScreen(screen: RecoverableScreen | null): void {
    if (screen === null) {
        sessionStorage.removeItem(ACTIVE_SCREEN_KEY);
    } else {
        sessionStorage.setItem(ACTIVE_SCREEN_KEY, screen);
    }
}
