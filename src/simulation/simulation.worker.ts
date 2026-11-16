import { runSimulations } from "./simulator";
import type { GameConfiguration } from "../game/gameConfiguration";
import type { SimulationOptions, SimulationBatchResult } from "./types";

interface SimulationRequest {
    options: SimulationOptions;
    configuration: GameConfiguration;
}

type SimulationResponse =
    | { type: "complete"; result: SimulationBatchResult }
    | { type: "error"; message: string };

self.addEventListener("message", (event: MessageEvent<SimulationRequest>) => {
    try {
        const result = runSimulations(event.data.options, event.data.configuration);
        self.postMessage({ type: "complete", result } satisfies SimulationResponse);
    } catch (error) {
        self.postMessage({
            type: "error",
            message: error instanceof Error ? error.message : "Erreur inattendue de simulation.",
        } satisfies SimulationResponse);
    }
});
