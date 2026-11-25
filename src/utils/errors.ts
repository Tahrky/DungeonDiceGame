export const UNKNOWN_ERROR_MESSAGE = "Erreur de connexion inconnue.";

export function getErrorMessage(error: unknown, fallback = UNKNOWN_ERROR_MESSAGE): string {
    return error instanceof Error ? error.message : fallback;
}

export function formatFailure(prefix: string, error: unknown, fallback = `${prefix}.`): string {
    return error instanceof Error ? `${prefix} : ${error.message}` : fallback;
}
