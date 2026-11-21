import type { SimulationBatchResult } from "./types";

export function createSimulationJsonBlob(result: SimulationBatchResult): Blob {
    const parts: BlobPart[] = ["{"];
    let firstProperty = true;

    for (const [key, value] of Object.entries(result)) {
        if (value === undefined) continue;
        if (!firstProperty) parts.push(",");
        firstProperty = false;
        parts.push(JSON.stringify(key), ":");

        if (key === "matches") {
            parts.push("[");
            result.matches.forEach((match, index) => {
                if (index > 0) parts.push(",");
                parts.push(JSON.stringify(match));
            });
            parts.push("]");
            continue;
        }

        const serializedValue = JSON.stringify(value);
        if (serializedValue !== undefined) parts.push(serializedValue);
    }

    parts.push("}\n");
    return new Blob(parts, { type: "application/json" });
}
