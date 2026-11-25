import type { MatchRandomState, PlayerId } from "../types/GameTypes";

export interface SeededRandom {
    (): number;
    getState(): number;
}

export interface MatchRandomStreams {
    dice: SeededRandom;
    actions: Record<PlayerId, SeededRandom>;
}

const ACTION_SEED_SALTS: Record<PlayerId, number> = { 1: 0xa5a5a5a5, 2: 0x5a5a5a5a };

export function createSeededRandom(seed: number): SeededRandom {
    let value = seed || 0x6d2b79f5;
    const random = () => {
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        return (value >>> 0) / 0x1_0000_0000;
    };
    return Object.assign(random, { getState: () => value >>> 0 });
}

export function createMatchRandomStreams(seed: number): MatchRandomStreams {
    return {
        dice: createSeededRandom(seed),
        actions: {
            1: createSeededRandom((seed ^ ACTION_SEED_SALTS[1]) >>> 0),
            2: createSeededRandom((seed ^ ACTION_SEED_SALTS[2]) >>> 0),
        },
    };
}

export function getMatchRandomState(streams: MatchRandomStreams): MatchRandomState {
    return {
        dice: streams.dice.getState(),
        actions: { 1: streams.actions[1].getState(), 2: streams.actions[2].getState() },
    };
}

export function restoreMatchRandomStreams(state: MatchRandomState): MatchRandomStreams {
    return {
        dice: createSeededRandom(state.dice),
        actions: {
            1: createSeededRandom(state.actions[1]),
            2: createSeededRandom(state.actions[2]),
        },
    };
}

export function isMatchRandomState(value: unknown): value is MatchRandomState {
    const isState = (state: unknown): state is number =>
        typeof state === "number" && Number.isInteger(state) && state > 0 && state <= 0xffffffff;
    if (
        typeof value !== "object" ||
        value === null ||
        !("dice" in value) ||
        !("actions" in value)
    ) {
        return false;
    }
    const actions = value.actions;
    return (
        isState(value.dice) &&
        typeof actions === "object" &&
        actions !== null &&
        "1" in actions &&
        "2" in actions &&
        isState(actions[1]) &&
        isState(actions[2])
    );
}

export function pickIndex(random: number, length: number): number {
    const unit = Math.max(0, Math.min(1 - Number.EPSILON, random));
    return Math.min(length - 1, Math.floor(unit * length));
}

export function shuffle<T>(items: readonly T[], random?: () => number): T[] {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = pickIndex(random?.() ?? 0.5, index + 1);
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
    }
    return shuffled;
}
