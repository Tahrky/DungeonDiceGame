import {
    MAX_AVAILABLE_DECK_SIZE,
    MAX_DECK_SIZE,
    MAX_DICE_COUNT,
    MAX_MAX_MONSTERS_PER_PLAYER,
    MAX_MONSTERS_KILLED_FOR_VICTORY,
    MAX_PLAYER_HEALTH,
    GAME_OPTIONS,
    MIN_DECK_SIZE,
    MIN_DICE_COUNT,
    MIN_MAX_MONSTERS_PER_PLAYER,
    MIN_MONSTERS_KILLED_FOR_VICTORY,
    MIN_PLAYER_HEALTH,
} from "../../data/configuration";

export type NumberSettingKey =
    | "diceCount"
    | "deckSize"
    | "initialPlayerHealth"
    | "maxMonstersPerPlayer"
    | "maxSummonsPerMonster"
    | "monstersKilledForVictory";

export type ToggleSettingKey =
    | "allowBaseAttackOnSummonTurn"
    | "removeInvocationDiceWhenNoMonsters"
    | "protectFirstDeployment"
    | "randomBoard"
    | "testBoard";

export const NUMBER_SETTINGS: readonly {
    readonly key: NumberSettingKey;
    readonly min: number;
    readonly max: number;
    readonly label: string;
}[] = [
    {
        key: "diceCount",
        min: MIN_DICE_COUNT,
        max: MAX_DICE_COUNT,
        label: `Nombre de dés (${MIN_DICE_COUNT} à ${MAX_DICE_COUNT})`,
    },
    {
        key: "deckSize",
        min: MIN_DECK_SIZE,
        max: MAX_AVAILABLE_DECK_SIZE,
        label: `Monstres différents par deck (${MIN_DECK_SIZE} à ${MAX_AVAILABLE_DECK_SIZE} disponibles, jusqu’à ${MAX_DECK_SIZE} prévus)`,
    },
    {
        key: "initialPlayerHealth",
        min: MIN_PLAYER_HEALTH,
        max: MAX_PLAYER_HEALTH,
        label: `Points de vie de départ (${MIN_PLAYER_HEALTH} à ${MAX_PLAYER_HEALTH})`,
    },
    {
        key: "maxMonstersPerPlayer",
        min: MIN_MAX_MONSTERS_PER_PLAYER,
        max: MAX_MAX_MONSTERS_PER_PLAYER,
        label: `Monstres invocables par joueur (${MIN_MAX_MONSTERS_PER_PLAYER} à ${MAX_MAX_MONSTERS_PER_PLAYER})`,
    },
    {
        key: "maxSummonsPerMonster",
        min: GAME_OPTIONS.maxSummonsPerMonster.min,
        max: GAME_OPTIONS.maxSummonsPerMonster.max,
        label: `Invocations maximum par type de monstre (${GAME_OPTIONS.maxSummonsPerMonster.min} à ${GAME_OPTIONS.maxSummonsPerMonster.max})`,
    },
    {
        key: "monstersKilledForVictory",
        min: MIN_MONSTERS_KILLED_FOR_VICTORY,
        max: MAX_MONSTERS_KILLED_FOR_VICTORY,
        label: `Monstres tués pour gagner (${MIN_MONSTERS_KILLED_FOR_VICTORY} à ${MAX_MONSTERS_KILLED_FOR_VICTORY})`,
    },
];

export const TOGGLE_SETTINGS: readonly {
    readonly key: ToggleSettingKey;
    readonly label: string;
}[] = [
    {
        key: "allowBaseAttackOnSummonTurn",
        label: "Autoriser l’attaque de la base au tour d’apparition",
    },
    {
        key: "removeInvocationDiceWhenNoMonsters",
        label: "Retirer les symboles d’invocation quand la limite d’invocations est atteinte",
    },
    {
        key: "protectFirstDeployment",
        label: "Préserver une zone de premier déploiement pour chaque joueur",
    },
    { key: "randomBoard", label: "Choisir un plateau prédéfini aléatoire à chaque partie" },
    { key: "testBoard", label: "Utiliser le plateau de test compact (11 × 7)" },
];
