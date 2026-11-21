import { runSimulations } from "./simulator";
import type { SimulationWorkerRequest, SimulationWorkerResponse } from "./workerPool";

self.addEventListener("message", (event: MessageEvent<SimulationWorkerRequest>) => {
    const { options, configuration, startIndex } = event.data;
    try {
        const result = runSimulations(options, configuration, undefined, startIndex, (completedGames) =>
            self.postMessage({
                type: "progress",
                startIndex,
                completedGames,
            } satisfies SimulationWorkerResponse),
        );
        self.postMessage({
            type: "complete",
            startIndex,
            result,
        } satisfies SimulationWorkerResponse);
    } catch (error) {
        self.postMessage({
            type: "error",
            startIndex,
            message: error instanceof Error ? error.message : "Erreur inattendue de simulation.",
        } satisfies SimulationWorkerResponse);
    }
});
