import type { Monster } from "../types/GameTypes";
import { getSupportValue } from "./ai/monsterValue";
import { pickIndex } from "./random";
import {
    choosesRandomDeck,
    DEFAULT_BOT_STRATEGY_WEIGHTS,
    type BotProfile,
    type BotStrategyWeights,
} from "./botProfiles";

function offenseValue(monster: Monster): number {
    return monster.attacks.reduce((score, attack) => {
        const area = attack.pattern.type === "directionalArea" || attack.hitsAllies ? 1.5 : 1;
        const statusDamage = attack.statusEffect?.damagePerTurn ?? 0;
        return score + ((attack.damage + statusDamage) * area) / Math.max(1, attack.cost);
    }, 0);
}

export function scoreMonsterForProfile(
    monster: Monster,
    profile: BotProfile,
    weights: Readonly<BotStrategyWeights> = DEFAULT_BOT_STRATEGY_WEIGHTS,
): number {
    switch (profile) {
        case "cheap":
            return -monster.cost * weights.monsterCost;
        case "expensive":
            return monster.cost * weights.monsterCost;
        case "offensive":
        case "tracker":
            return (
                offenseValue(monster) * 4 * weights.monsterOffense +
                monster.hp * 0.1 * weights.monsterDurability -
                monster.cost * 0.15 * weights.monsterCost
            );
        case "support":
            return (
                getSupportValue(monster) * 10 * weights.monsterSupport +
                offenseValue(monster) * 0.1 * weights.monsterOffense -
                monster.cost * 0.1 * weights.monsterCost
            );
        case "defensive":
            return (
                offenseValue(monster) * 2 * weights.monsterOffense +
                monster.hp * 0.6 * weights.monsterDurability -
                monster.cost * 0.1 * weights.monsterCost
            );
        case "balanced":
        case "random-deck":
        case "random-strategy":
            return (
                5 -
                Math.abs(monster.cost - 4) * weights.monsterCost +
                monster.hp * 0.1 * weights.monsterDurability
            );
        case "random":
            return 0;
        case "greedy":
            return offenseValue(monster) * 2 * weights.monsterOffense - monster.cost * 0.1;
    }
}

function isNextExpensiveCost(cost: number, previousCost: number | undefined): boolean {
    return previousCost === undefined ? cost === 2 || cost === 3 : cost > previousCost;
}

export function canDeployMonsterForProfile(
    monster: Monster,
    profile: BotProfile,
    deployedCosts: readonly number[],
): boolean {
    if (profile !== "expensive") return true;
    const highestCost = deployedCosts.length > 0 ? Math.max(...deployedCosts) : undefined;
    return isNextExpensiveCost(monster.cost, highestCost);
}

function chooseRandomDeck(
    monsters: readonly Monster[],
    deckSize: number,
    random: () => number,
): string[] {
    const deck: string[] = [];
    const remaining = [...monsters];
    while (deck.length < deckSize && remaining.length > 0) {
        const index = pickIndex(random(), remaining.length);
        deck.push(remaining[index]!.id);
        remaining.splice(index, 1);
    }
    return deck;
}

function pickRankWeightedIndex(count: number, random: () => number): number {
    let totalWeight = 0;
    for (let rank = 0; rank < count; rank++) totalWeight += 1 / (rank + 1);
    let selection = Math.max(0, Math.min(1 - Number.EPSILON, random())) * totalWeight;
    for (let rank = 0; rank < count; rank++) {
        selection -= 1 / (rank + 1);
        if (selection < 0) return rank;
    }
    return count - 1;
}

export function chooseDeck(
    monsters: readonly Monster[],
    profile: BotProfile,
    deckSize: number,
    random: () => number = Math.random,
    weights: Readonly<BotStrategyWeights> = DEFAULT_BOT_STRATEGY_WEIGHTS,
): string[] {
    if (choosesRandomDeck(profile)) return chooseRandomDeck(monsters, deckSize, random);

    const remaining = [...monsters].sort(
        (first, second) =>
            scoreMonsterForProfile(second, profile, weights) -
                scoreMonsterForProfile(first, profile, weights) ||
            first.id.localeCompare(second.id),
    );
    const deck: string[] = [];
    while (deck.length < deckSize && remaining.length > 0) {
        const previousCost =
            deck.length === 0
                ? undefined
                : (monsters.find((monster) => monster.id === deck.at(-1))?.cost ?? 0);
        const preferredCandidates =
            profile === "expensive"
                ? remaining.filter((monster) => isNextExpensiveCost(monster.cost, previousCost))
                : remaining;
        const candidates = preferredCandidates.length > 0 ? preferredCandidates : remaining;
        const selected = candidates[pickRankWeightedIndex(candidates.length, random)]!;
        deck.push(selected.id);
        remaining.splice(remaining.indexOf(selected), 1);
    }
    return deck;
}

export function describeDeploymentChoice(monster: Monster, profile: BotProfile): string {
    switch (profile) {
        case "cheap":
            return `profil cheap : privilégie le coût bas (${monster.cost})`;
        case "expensive":
            return `profil expensive : privilégie le coût élevé (${monster.cost})`;
        case "offensive":
            return `profil offensive : valeur offensive ${offenseValue(monster).toFixed(2)}`;
        case "support":
            return `profil support : valeur de soutien ${getSupportValue(monster)}`;
        case "defensive":
            return `profil défensif : privilégie les PV et les attaques, coût ${monster.cost}`;
        case "tracker":
            return `profil traqueur : privilégie les attaques contre les monstres, coût ${monster.cost}`;
        case "balanced":
            return `profil balanced : choix polyvalent, coût ${monster.cost}, ${monster.hp} PV`;
        case "random":
            return `profil random : choix aléatoire, coût ${monster.cost}`;
        case "random-deck":
            return `profil random-deck : deck aléatoire, stratégie équilibrée`;
        case "random-strategy":
            return `profil random-strategy : stratégie aléatoire, deck de référence`;
        case "greedy":
            return `profil greedy : valeur immédiate, coût ${monster.cost}`;
    }
}
