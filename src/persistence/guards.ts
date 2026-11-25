import { BOT_PROFILES, type BotProfile } from "../simulation/types";

export function isProfile(value: unknown): value is BotProfile {
    return BOT_PROFILES.includes(value as BotProfile);
}
