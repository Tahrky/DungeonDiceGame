import { isPlainRecord } from "../utils/guards";

export const BOT_PROFILES = [
    "balanced",
    "cheap",
    "expensive",
    "offensive",
    "support",
    "defensive",
    "tracker",
    "random",
    "random-deck",
    "random-strategy",
    "greedy",
] as const;

export type BotProfile = (typeof BOT_PROFILES)[number];
export type BotTactic = "offense" | "hunt" | "balanced" | "defense";

export interface BotTacticDecision {
    tactic: BotTactic;
    description: string;
}

export const BOT_PROFILE_LABELS: Record<BotProfile, string> = {
    balanced: "Polyvalent — adaptatif",
    cheap: "Monstres peu chers — adaptatif",
    expensive: "Monstres coûteux — adaptatif",
    offensive: "Offensif — victoire aux PV",
    support: "Soutien — adaptatif",
    defensive: "Défensif — périmètre",
    tracker: "Traqueur — élimination des monstres",
    random: "Aléatoire — actions et deck",
    "random-deck": "Deck aléatoire — stratégie équilibrée",
    "random-strategy": "Stratégie aléatoire — deck de référence",
    greedy: "Glouton — valeur immédiate",
};

export const BOT_STRATEGY_WEIGHT_KEYS = [
    "baseDamage",
    "damage",
    "statusDamage",
    "kills",
    "support",
    "friendlyDamage",
    "costEfficiency",
    "monsterOffense",
    "monsterSupport",
    "monsterDurability",
    "monsterCost",
    "invocationPriority",
    "territoryExpansion",
    "defensivePlacement",
    "pathBlockade",
    "routeDenial",
    "routeRedundancy",
    "chokepointControl",
    "strategicPlacement",
    "movementObjective",
    "movementHunt",
    "movementRoute",
    "movementThreat",
    "defensiveCoverage",
    "formationCohesion",
    "interception",
] as const;

export type BotStrategyWeights = Record<(typeof BOT_STRATEGY_WEIGHT_KEYS)[number], number>;
export type BotStrategyWeightMap = Partial<Record<BotProfile, BotStrategyWeights>>;

export const DEFAULT_BOT_STRATEGY_WEIGHTS: Readonly<BotStrategyWeights> = Object.freeze(
    Object.fromEntries(BOT_STRATEGY_WEIGHT_KEYS.map((key) => [key, 1])) as BotStrategyWeights,
);

export const MIN_BOT_STRATEGY_WEIGHT = 0.25;
export const MAX_BOT_STRATEGY_WEIGHT = 2;

const WEIGHT_KEYS = new Set<string>(BOT_STRATEGY_WEIGHT_KEYS);

const RANDOM_ACTIONS_TACTIC: BotTacticDecision = {
    tactic: "balanced",
    description: "choisit aléatoirement des actions légales",
};

const FIXED_TACTICS: Partial<Record<BotProfile, BotTacticDecision>> = {
    random: RANDOM_ACTIONS_TACTIC,
    "random-strategy": RANDOM_ACTIONS_TACTIC,
    "random-deck": {
        tactic: "balanced",
        description: "utilise la stratégie équilibrée avec un deck aléatoire",
    },
    greedy: {
        tactic: "offense",
        description: "maximise la valeur immédiate sans recherche future",
    },
    offensive: {
        tactic: "offense",
        description: "priorise les PV de la base adverse sans ignorer les menaces",
    },
    tracker: { tactic: "hunt", description: "traque les monstres et protège sa base" },
    defensive: {
        tactic: "defense",
        description: "protège son périmètre et avance quand il est sûr",
    },
};

const COUNTER_TACTICS: Partial<Record<BotProfile, BotTactic>> = {
    offensive: "defense",
    tracker: "offense",
    defensive: "balanced",
    expensive: "hunt",
};

const TACTIC_DESCRIPTIONS: Record<BotTactic, string> = {
    offense: "attaque la base adverse pour contourner sa stratégie",
    hunt: "affaiblit les monstres coûteux de l’adversaire",
    balanced: "maintient une pression égale sur la base et les monstres",
    defense: "renforce son périmètre face à la pression sur sa base",
};

export function choosesRandomActions(profile: BotProfile): boolean {
    return profile === "random" || profile === "random-strategy";
}

export function choosesRandomDeck(profile: BotProfile): boolean {
    return profile === "random" || profile === "random-deck" || profile === "random-strategy";
}

export function chooseBotTactic(
    profile: BotProfile,
    opponentProfile: BotProfile,
): BotTacticDecision {
    const fixed = FIXED_TACTICS[profile];
    if (fixed) return { ...fixed };

    const tactic =
        COUNTER_TACTICS[opponentProfile] ?? (profile === "cheap" ? "offense" : "balanced");
    return {
        tactic,
        description: `s’adapte au profil « ${opponentProfile} » : ${TACTIC_DESCRIPTIONS[tactic]}`,
    };
}

function isValidWeight(weight: unknown): weight is number {
    return (
        typeof weight === "number" &&
        Number.isFinite(weight) &&
        weight >= MIN_BOT_STRATEGY_WEIGHT &&
        weight <= MAX_BOT_STRATEGY_WEIGHT
    );
}

export function parseBotStrategyWeightMap(value: unknown): BotStrategyWeightMap | null {
    if (!isPlainRecord(value)) return null;

    const weights: BotStrategyWeightMap = {};
    for (const [profile, record] of Object.entries(value)) {
        if (!BOT_PROFILES.includes(profile as BotProfile) || !isPlainRecord(record)) return null;
        if (Object.keys(record).some((key) => !WEIGHT_KEYS.has(key))) return null;

        const profileWeights = { ...DEFAULT_BOT_STRATEGY_WEIGHTS };
        for (const key of BOT_STRATEGY_WEIGHT_KEYS) {
            const weight = record[key];
            if (weight === undefined) continue;
            if (!isValidWeight(weight)) return null;
            profileWeights[key] = weight;
        }
        weights[profile as BotProfile] = profileWeights;
    }
    return weights;
}
