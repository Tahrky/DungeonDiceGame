const DATABASE_NAME = "dungeon-dice-recovery";
const DATABASE_VERSION = 1;

export const GAME_SESSION_STORE = "game-sessions";
export const SIMULATION_RUN_STORE = "simulation-runs";
export const SIMULATION_CHUNK_STORE = "simulation-chunks";
export const RECORD_VERSION = 1;

interface TransactionMessages {
    readonly error: string;
    readonly abort: string;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
        let request: IDBOpenDBRequest;
        try {
            request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        } catch (error) {
            reject(error instanceof Error ? error : new Error("Stockage de reprise indisponible."));
            return;
        }

        request.onupgradeneeded = () => {
            const database = request.result;
            for (const store of [GAME_SESSION_STORE, SIMULATION_RUN_STORE]) {
                if (!database.objectStoreNames.contains(store)) {
                    database.createObjectStore(store, { keyPath: "sessionId" });
                }
            }
            if (!database.objectStoreNames.contains(SIMULATION_CHUNK_STORE)) {
                database.createObjectStore(SIMULATION_CHUNK_STORE, {
                    keyPath: ["sessionId", "startIndex"],
                });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
            reject(request.error ?? new Error("Impossible d’ouvrir le stockage de reprise."));
        request.onblocked = () => reject(new Error("Le stockage de reprise est bloqué."));
    });

    return databasePromise;
}

export async function runTransaction<T = undefined>(
    stores: string | string[],
    mode: IDBTransactionMode,
    messages: TransactionMessages,
    operate: (transaction: IDBTransaction) => IDBRequest<T> | undefined,
): Promise<T> {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(stores, mode);
        const request = operate(transaction);
        transaction.oncomplete = () => resolve(request?.result as T);
        transaction.onerror = () => reject(transaction.error ?? new Error(messages.error));
        transaction.onabort = () => reject(transaction.error ?? new Error(messages.abort));
    });
}

export function getSessionChunkRange(sessionId: string): IDBKeyRange {
    return IDBKeyRange.bound([sessionId, 0], [sessionId, Number.MAX_SAFE_INTEGER]);
}

export function getRecord(storeName: string, key: IDBValidKey): Promise<unknown> {
    return runTransaction<unknown>(
        storeName,
        "readonly",
        {
            error: "Impossible de lire le stockage de reprise.",
            abort: "La lecture de reprise a été interrompue.",
        },
        (transaction) => transaction.objectStore(storeName).get(key),
    );
}

export async function putRecord(storeName: string, value: object): Promise<void> {
    await runTransaction(
        storeName,
        "readwrite",
        {
            error: "Impossible d’enregistrer la reprise.",
            abort: "L’enregistrement de reprise a été interrompu.",
        },
        (transaction) => {
            transaction.objectStore(storeName).put(value);
            return undefined;
        },
    );
}

export async function deleteRecord(storeName: string, key: IDBValidKey): Promise<void> {
    await runTransaction(
        storeName,
        "readwrite",
        {
            error: "Impossible d’effacer les données de reprise.",
            abort: "L’effacement de reprise a été interrompu.",
        },
        (transaction) => {
            transaction.objectStore(storeName).delete(key);
            return undefined;
        },
    );
}

export async function clearAllRecoveryData(): Promise<void> {
    const stores = [GAME_SESSION_STORE, SIMULATION_RUN_STORE, SIMULATION_CHUNK_STORE];
    await runTransaction(
        stores,
        "readwrite",
        {
            error: "Impossible d’effacer les sauvegardes de reprise.",
            abort: "L’effacement des sauvegardes de reprise a été interrompu.",
        },
        (transaction) => {
            for (const store of stores) transaction.objectStore(store).clear();
            return undefined;
        },
    );
}
