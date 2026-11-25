export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return isRecord(value) && !Array.isArray(value);
}

export function isIntegerInRange(value: unknown, min: number, max: number): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}
