import { useEffect, useState } from "react";
import {
    analyzeSimulationData,
    parseSimulationData,
    type SimulationAnalytics,
    type SimulationData,
} from "../../simulation/analysis";
import { createSimulationJsonBlob } from "../../simulation/export";
import type { SimulationBatchResult } from "../../simulation/types";
import { downloadBlob } from "../../utils/browser";
import { formatFailure } from "../../utils/errors";
import { JsonFileButton } from "../common/JsonFileButton";
import { GeneralStatistics } from "./GeneralStatistics";
import { MatchInspector } from "./MatchInspector";
import { ProfileStatistics } from "./ProfileStatistics";
import { analyzeEngineTournament } from "../../simulation/tournament";

interface ResultsAnalysisPanelProps {
    readonly generatedResult: SimulationBatchResult | null;
}

interface Analysis {
    readonly data: SimulationData;
    readonly analytics: SimulationAnalytics;
}

const TABS = [
    { id: "general", label: "Statistiques générales" },
    { id: "profile", label: "Statistiques par profil" },
    { id: "match", label: "Statistiques d’une partie" },
    { id: "engines", label: "Classement des moteurs" },
] as const;

export function ResultsAnalysisPanel({ generatedResult }: ResultsAnalysisPanelProps) {
    const [analysis, setAnalysis] = useState<Analysis | null>(null);
    const [selectedMatchId, setSelectedMatchId] = useState("");
    const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("general");
    const [fileName, setFileName] = useState("");
    const [error, setError] = useState("");
    const hasDetailedHistory =
        analysis?.data.matches.every((match) => match.history.length > 0) ?? true;

    function loadData(data: SimulationData, name: string): void {
        setAnalysis({ data, analytics: analyzeSimulationData(data) });
        setSelectedMatchId(String(data.matches[0]?.id ?? ""));
        setActiveTab("general");
        setFileName(name);
        setError("");
    }

    useEffect(() => {
        if (!generatedResult) return;
        const parsed = parseSimulationData(generatedResult);
        if (parsed) {
            loadData(parsed, "Dernière simulation");
        } else {
            setAnalysis(null);
            setFileName("");
            setError("Impossible d’analyser le résultat de la simulation.");
        }
    }, [generatedResult]);

    async function importJson(file: File): Promise<void> {
        setError("");
        try {
            const parsed = parseSimulationData(JSON.parse(await file.text()) as unknown);
            if (parsed) loadData(parsed, file.name);
            else setError("Ce fichier n’est pas un export de simulation compatible.");
        } catch {
            setError("Impossible de lire ce JSON. Vérifiez le contenu du fichier.");
        }
    }

    function downloadLastJson(result: SimulationBatchResult): void {
        setError("");
        try {
            downloadBlob(
                createSimulationJsonBlob(result),
                `dungeon-dice-simulations-seed-${result.options.seed}.json`,
            );
        } catch (caught) {
            setError(
                formatFailure(
                    "Impossible de télécharger le JSON",
                    caught,
                    "Impossible de préparer le téléchargement JSON.",
                ),
            );
        }
    }

    return (
        <section className="simulation-analysis" aria-labelledby="simulation-analysis-title">
            <h3 id="simulation-analysis-title">Analyser un export JSON</h3>
            <p className="simulation-description">
                Importez un résultat de simulation ou consultez le dernier batch généré.
            </p>
            <div className="simulation-file-actions">
                <JsonFileButton label="Choisir un fichier JSON" onFile={importJson} />
                {generatedResult && (
                    <button
                        className="secondary-button"
                        onClick={() => downloadLastJson(generatedResult)}
                    >
                        Télécharger le dernier JSON
                    </button>
                )}
                {fileName && <span className="simulation-file-name">{fileName}</span>}
            </div>
            {error && (
                <output className="simulation-notice is-error" role="alert">
                    {error}
                </output>
            )}
            {analysis && activeTab !== "profile" && !hasDetailedHistory && (
                <p className="simulation-description" role="status">
                    Les résultats légers ne conservent pas les actions détaillées. Les statistiques
                    d’attaques, de dégâts et de déplacements par monstre ne sont pas disponibles.
                </p>
            )}

            {analysis ? (
                <>
                    <div className="simulation-tabs" role="tablist" aria-label="Vue des résultats">
                        {TABS.map(({ id, label }) => (
                            <button
                                key={id}
                                id={`simulation-${id}-tab`}
                                type="button"
                                role="tab"
                                aria-selected={activeTab === id}
                                aria-controls={`simulation-${id}-panel`}
                                className={activeTab === id ? "is-active" : ""}
                                onClick={() => setActiveTab(id)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div
                        id={`simulation-${activeTab}-panel`}
                        role="tabpanel"
                        aria-labelledby={`simulation-${activeTab}-tab`}
                    >
                        {activeTab === "general" ? (
                            <GeneralStatistics
                                matchCount={analysis.data.matches.length}
                                analytics={analysis.analytics}
                                hasDetailedHistory={hasDetailedHistory}
                            />
                        ) : activeTab === "profile" ? (
                            <ProfileStatistics data={analysis.data} />
                        ) : activeTab === "engines" ? (
                            <div className="simulation-table-scroll">
                                <table className="simulation-table">
                                    <thead>
                                        <tr>
                                            <th>Moteur</th>
                                            <th>Points</th>
                                            <th>Parties</th>
                                            <th>Victoires</th>
                                            <th>Nuls</th>
                                            <th>Défaites</th>
                                            <th>Tours moyens</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analyzeEngineTournament(analysis.data.matches).map((result) => (
                                            <tr key={result.engine}>
                                                <td>{result.engine}</td>
                                                <td>{result.points.toFixed(1)}</td>
                                                <td>{result.played}</td>
                                                <td>{result.wins}</td>
                                                <td>{result.draws}</td>
                                                <td>{result.losses}</td>
                                                <td>{result.averageTurns.toFixed(1)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <MatchInspector
                                matches={analysis.data.matches}
                                configuration={analysis.data.configuration}
                                selectedMatchId={selectedMatchId}
                                onMatchChange={setSelectedMatchId}
                            />
                        )}
                    </div>
                </>
            ) : (
                !error && (
                    <p className="simulation-empty">
                        Aucun résultat chargé. Les exports sont au format JSON version 1.
                    </p>
                )
            )}
        </section>
    );
}
