import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getDefaultBoard, parseBoardDefinition, type BoardDefinition } from "../../game/boards";
import { parseBotStrategyWeightMap } from "../../game/botStrategy";
import {
    getDefaultGameConfiguration,
    parseGameConfiguration,
    type GameConfiguration,
} from "../../game/gameConfiguration";
import { isPlainRecord, isRecord } from "../../utils/guards";
import { compareTrainingCompatibility, createTrainingFingerprint } from "../training/versioning";
import type { BotStrategyWeightMap } from "../types";

type TrainingMetadata = Parameters<typeof compareTrainingCompatibility>[0];

async function readJsonFile(path: string, description: string): Promise<unknown> {
    const contents = await readFile(resolve(path), "utf8");
    try {
        return JSON.parse(contents) as unknown;
    } catch (error) {
        throw new Error(`Le fichier ${description} ${path} ne contient pas un JSON valide.`, {
            cause: error,
        });
    }
}

export async function loadConfiguration(path: string | undefined): Promise<{
    configuration: GameConfiguration;
    board: BoardDefinition;
}> {
    if (!path) return { configuration: getDefaultGameConfiguration(), board: getDefaultBoard() };
    const value = await readJsonFile(path, "de configuration");
    const envelope = isPlainRecord(value) ? value : undefined;
    const configuration = parseGameConfiguration(
        envelope && "configuration" in envelope ? envelope.configuration : value,
    );
    if (!configuration) throw new Error(`Configuration de jeu invalide : ${path}.`);
    const board =
        envelope && "board" in envelope ? parseBoardDefinition(envelope.board) : getDefaultBoard();
    if (!board) throw new Error(`Définition de plateau invalide : ${path}.`);
    return { configuration, board };
}

export async function loadPreviousWeights(path: string | undefined): Promise<unknown> {
    return path ? readJsonFile(path, "de poids") : undefined;
}

export async function loadStrategyWeights(
    path: string | undefined,
    configuration: GameConfiguration,
    board: BoardDefinition,
    allowIncompatibleTransfer: boolean,
): Promise<BotStrategyWeightMap | undefined> {
    if (!path) return undefined;
    const value = await readJsonFile(path, "de poids");
    const weights = parseBotStrategyWeightMap(
        isRecord(value) && "weights" in value ? value.weights : value,
    );
    if (!weights) throw new Error(`Poids stratégiques invalides : ${path}.`);
    const fingerprint = createTrainingFingerprint(configuration, board);
    const profiles =
        isRecord(value) && "profiles" in value ? (value.profiles as Record<string, unknown>) : {};
    for (const [profile, profileWeights] of Object.entries(weights)) {
        if (!profileWeights) continue;
        const profileReport = profiles[profile];
        const metadata =
            isRecord(profileReport) && "metadata" in profileReport
                ? (profileReport.metadata as TrainingMetadata)
                : undefined;
        const compatibility = compareTrainingCompatibility(metadata, fingerprint);
        if (compatibility.level === "legacy") {
            console.warn(`Poids « ${profile} » legacy : compatibilité inconnue.`);
            continue;
        }
        if (compatibility.level === "incompatible" && !allowIncompatibleTransfer) {
            throw new Error(
                `Poids « ${profile} » incompatibles : ${compatibility.differences.join(", ")}. ` +
                    `Ajoutez --allow-incompatible-transfer pour forcer leur utilisation.`,
            );
        }
        if (compatibility.level !== "exact") {
            console.warn(
                `Poids « ${profile} » : compatibilité ${compatibility.level}; ` +
                    `différences : ${compatibility.differences.join(", ")}.`,
            );
        }
    }
    return weights;
}

const toJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, toJson(value), "utf8");
}

export async function writeNewJsonFile(
    path: string,
    value: unknown,
    allowRename: boolean,
): Promise<string> {
    await mkdir(dirname(path), { recursive: true });
    const extension = path.endsWith(".json") ? ".json" : "";
    const base = path.slice(0, path.length - extension.length);
    for (let suffix = 1; ; suffix++) {
        const candidate = suffix === 1 ? path : `${base}-${suffix}${extension}`;
        try {
            await writeFile(candidate, toJson(value), { encoding: "utf8", flag: "wx" });
            return candidate;
        } catch (error) {
            if (!allowRename || !isRecord(error) || error.code !== "EEXIST") throw error;
        }
    }
}
