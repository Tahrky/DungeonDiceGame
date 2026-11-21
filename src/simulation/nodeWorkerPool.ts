import { availableParallelism } from "node:os";
import { parentPort, Worker } from "node:worker_threads";
import type { BoardDefinition } from "../game/boards";
import type { GameConfiguration } from "../game/gameConfiguration";
import {
    createSimulationChunks,
    mergeSimulationResults,
    MAX_SIMULATION_WORKERS,
} from "./workerPool";
import { runSimulations } from "./simulator";
import type { SimulationBatchResult, SimulationOptions } from "./types";

interface SimulationTask {
    readonly taskId: number;
    readonly options: SimulationOptions;
    readonly configuration: GameConfiguration;
    readonly board: BoardDefinition;
    readonly startIndex: number;
}

type WorkerResponse =
    | {
          readonly type: "progress";
          readonly taskId: number;
          readonly completedMatches: number;
      }
    | {
          readonly type: "complete";
          readonly taskId: number;
          readonly result: SimulationBatchResult;
      }
    | {
          readonly type: "error";
          readonly taskId: number;
          readonly message: string;
      };

interface PendingTask extends SimulationTask {
    readonly onProgress?: (completedMatches: number) => void;
    readonly progress?: { completedMatches: number };
    readonly resolve: (result: SimulationBatchResult) => void;
    readonly reject: (error: Error) => void;
    completedMatches: number;
}

interface WorkerSlot {
    readonly worker: Worker;
    currentTask?: PendingTask;
}

export function getNodeSimulationWorkerCount(): number {
    return Math.min(MAX_SIMULATION_WORKERS, Math.max(1, availableParallelism() - 1));
}

export class NodeSimulationWorkerPool {
    private readonly slots: WorkerSlot[];
    private readonly queue: PendingTask[] = [];
    private nextTaskId = 1;
    private closed = false;
    private failure: Error | undefined;

    constructor(workerCount = getNodeSimulationWorkerCount()) {
        if (
            !Number.isInteger(workerCount) ||
            workerCount < 1 ||
            workerCount > MAX_SIMULATION_WORKERS
        ) {
            throw new RangeError("Le nombre de workers Node est invalide.");
        }

        this.slots = Array.from({ length: workerCount }, () => {
            const slot: WorkerSlot = { worker: new Worker(new URL(import.meta.url)) };
            slot.worker.on("message", (response: WorkerResponse) =>
                this.handleResponse(slot, response),
            );
            slot.worker.on("error", (error) =>
                this.fail(error instanceof Error ? error : new Error(String(error))),
            );
            slot.worker.on("exit", (code) => {
                if (!this.closed) {
                    this.fail(new Error(`Un worker de simulation s’est arrêté (${code}).`));
                }
            });
            return slot;
        });
    }

    async run(
        options: SimulationOptions,
        configuration: GameConfiguration,
        board: BoardDefinition,
        onProgress?: (completedMatches: number) => void,
    ): Promise<SimulationBatchResult> {
        this.ensureOpen();
        const workerCount = Math.min(this.slots.length, options.games);
        const chunks = createSimulationChunks(options.games, workerCount);
        const progress = { completedMatches: 0 };
        const tasks = chunks.map(
            (chunk) =>
                new Promise<SimulationBatchResult>((resolve, reject) => {
                    this.queue.push({
                        taskId: this.nextTaskId++,
                        options: { ...options, games: chunk.games },
                        configuration,
                        board,
                        startIndex: chunk.startIndex,
                        ...(onProgress === undefined ? {} : { onProgress }),
                        progress,
                        resolve,
                        reject,
                        completedMatches: 0,
                    });
                }),
        );
        this.dispatch();
        const results = await Promise.all(tasks);
        this.ensureOpen();
        return mergeSimulationResults(results, options);
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;
        const error = new Error("Le pool de simulation a été fermé.");
        for (const task of this.queue.splice(0)) task.reject(error);
        for (const slot of this.slots) {
            slot.currentTask?.reject(error);
            slot.currentTask = undefined;
        }
        await Promise.all(this.slots.map(({ worker }) => worker.terminate()));
    }

    private ensureOpen(): void {
        if (this.failure) throw this.failure;
        if (this.closed) throw new Error("Le pool de simulation est fermé.");
    }

    private dispatch(): void {
        if (this.closed || this.failure) return;
        for (const slot of this.slots) {
            if (slot.currentTask) continue;
            const task = this.queue.shift();
            if (!task) return;
            slot.currentTask = task;
            try {
                slot.worker.postMessage({
                    taskId: task.taskId,
                    options: task.options,
                    configuration: task.configuration,
                    board: task.board,
                    startIndex: task.startIndex,
                } satisfies SimulationTask);
            } catch (error) {
                slot.currentTask = undefined;
                task.reject(
                    error instanceof Error
                        ? error
                        : new Error(`Impossible d’envoyer un lot au worker : ${String(error)}`),
                );
                this.dispatch();
            }
        }
    }

    private handleResponse(slot: WorkerSlot, response: WorkerResponse): void {
        const task = slot.currentTask;
        if (!task || task.taskId !== response.taskId) {
            this.fail(new Error("Le worker a répondu à une tâche inconnue."));
            return;
        }
        if (response.type === "progress") {
            if (
                response.completedMatches <= task.completedMatches ||
                response.completedMatches > task.options.games
            ) {
                this.fail(new Error("Le worker a signalé une progression invalide."));
                return;
            }
            const delta = response.completedMatches - task.completedMatches;
            task.completedMatches = response.completedMatches;
            if (task.progress) task.progress.completedMatches += delta;
            task.onProgress?.(task.progress?.completedMatches ?? response.completedMatches);
            return;
        }
        slot.currentTask = undefined;
        if (response.type === "error") {
            task.reject(new Error(response.message));
        } else {
            task.resolve(response.result);
        }
        this.dispatch();
    }

    private fail(error: Error): void {
        if (this.failure) return;
        this.failure = error;
        for (const task of this.queue.splice(0)) task.reject(error);
        for (const slot of this.slots) {
            slot.currentTask?.reject(error);
            slot.currentTask = undefined;
        }
    }
}

export function startNodeSimulationWorker(): void {
    const port = parentPort;
    if (!port) throw new Error("Le port parent du worker de simulation est absent.");

    port.on("message", (task: SimulationTask) => {
        try {
            const result = runSimulations(
                task.options,
                task.configuration,
                task.board,
                task.startIndex,
                (completedMatches) => {
                    if (completedMatches % 10 === 0 || completedMatches === task.options.games) {
                        port.postMessage({
                            type: "progress",
                            taskId: task.taskId,
                            completedMatches,
                        } satisfies WorkerResponse);
                    }
                },
            );
            port.postMessage({
                type: "complete",
                taskId: task.taskId,
                result,
            } satisfies WorkerResponse);
        } catch (error) {
            port.postMessage({
                type: "error",
                taskId: task.taskId,
                message: error instanceof Error ? error.message : String(error),
            } satisfies WorkerResponse);
        }
    });
}
