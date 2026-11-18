import { useEffect, useRef, useState } from "react";
import {
    analyzeSimulationData,
    parseSimulationData,
    type SimulationAnalytics,
    type SimulationData,
} from "../../simulation/analysis";
import { BOT_PROFILE_LABELS } from "../../game/botStrategy";
import { BOT_PROFILES, type SimulationBatchResult } from "../../simulation/types";
import { MetricBarChart } from "./MetricBarChart";
import { MatchInspector } from "./MatchInspector";

interface ResultsAnalysisPanelProps {
    readonly generatedResult: SimulationBatchResult | null;
}

function downloadJson(result: SimulationBatchResult): void {
    const url = URL.createObjectURL(
        new Blob([`${JSON.stringify(result, null, 2)}\n`], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `dungeon-dice-simulations-seed-${result.options.seed}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="simulation-metric-card">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}

export function ResultsAnalysisPanel({ generatedResult }: ResultsAnalysisPanelProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [data, setData] = useState<SimulationData | null>(null);
    const [analytics, setAnalytics] = useState<SimulationAnalytics | null>(null);
    const [selectedMatchId, setSelectedMatchId] = useState("");
    const [fileName, setFileName] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        if (!generatedResult) return;
        const parsed = parseSimulationData(generatedResult);
        if (!parsed) return;
        setData(parsed);
        setAnalytics(analyzeSimulationData(parsed));
        setSelectedMatchId(String(parsed.matches[0]?.id ?? ""));
        setFileName("Dernière simulation");
        setError("");
    }, [generatedResult]);

    async function importJson(file: File | undefined): Promise<void> {
        if (!file) return;
        setError("");
        try {
            const parsed = parseSimulationData(JSON.parse(await file.text()) as unknown);
            if (!parsed) {
                setError("Ce fichier n’est pas un export de simulation compatible.");
                return;
            }
            setData(parsed);
            setAnalytics(analyzeSimulationData(parsed));
            setSelectedMatchId(String(parsed.matches[0]?.id ?? ""));
            setFileName(file.name);
        } catch {
            setError("Impossible de lire ce JSON. Vérifiez le contenu du fichier.");
        }
    }

    return (
        <section className="simulation-analysis" aria-labelledby="simulation-analysis-title">
            <h3 id="simulation-analysis-title">Analyser un export JSON</h3>
            <p className="simulation-description">
                Importez un résultat de simulation ou consultez le dernier batch généré.
            </p>
            <div className="simulation-file-actions">
                <button className="secondary-button" onClick={() => inputRef.current?.click()}>
                    Choisir un fichier JSON
                </button>
                {generatedResult && (
                    <button
                        className="secondary-button"
                        onClick={() => downloadJson(generatedResult)}
                    >
                        Télécharger le dernier JSON
                    </button>
                )}
                <input
                    ref={inputRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        void importJson(file);
                    }}
                />
                {fileName && <span className="simulation-file-name">{fileName}</span>}
            </div>
            {error && (
                <output className="simulation-notice is-error" role="alert">
                    {error}
                </output>
            )}

            {data && analytics ? (
                <>
                    <div className="simulation-metrics">
                        <MetricCard label="Matchs analysés" value={String(data.matches.length)} />
                        <MetricCard
                            label="Tours moyens"
                            value={analytics.averageTurns.toFixed(1)}
                        />
                        <MetricCard
                            label="Monstres invoqués / match · J1"
                            value={analytics.averageDeployments[1].toFixed(1)}
                        />
                        <MetricCard
                            label="Monstres invoqués / match · J2"
                            value={analytics.averageDeployments[2].toFixed(1)}
                        />
                        <MetricCard
                            label="Victoires · J1"
                            value={String(analytics.winsByPlayer[1])}
                        />
                        <MetricCard
                            label="Victoires · J2"
                            value={String(analytics.winsByPlayer[2])}
                        />
                        <MetricCard
                            label="Victoires · PV de la base à 0"
                            value={String(analytics.winsByFinishReason.baseDestroyed)}
                        />
                        <MetricCard
                            label="Victoires · élimination des monstres adverses"
                            value={String(analytics.winsByFinishReason.monstersEliminated)}
                        />
                        <MetricCard label="Matchs nuls" value={String(analytics.draws)} />
                        <MetricCard
                            label="Monstres perdus / match · J1"
                            value={analytics.averageMonstersLost[1].toFixed(1)}
                        />
                        <MetricCard
                            label="Monstres perdus / match · J2"
                            value={analytics.averageMonstersLost[2].toFixed(1)}
                        />
                        <MetricCard
                            label="Dégâts reçus / match · J1"
                            value={analytics.averageDamageReceived[1].toFixed(1)}
                        />
                        <MetricCard
                            label="Dégâts reçus / match · J2"
                            value={analytics.averageDamageReceived[2].toFixed(1)}
                        />
                        <MetricCard
                            label="Réserve restante / match · J1"
                            value={analytics.averageRemainingResources[1].toFixed(1)}
                        />
                        <MetricCard
                            label="Réserve restante / match · J2"
                            value={analytics.averageRemainingResources[2].toFixed(1)}
                        />
                        <MetricCard
                            label="Symboles dépensés / match (Inv/Att/Mvt) · J1"
                            value={
                                analytics.averageSymbolsSpent[1]
                                    ? `${analytics.averageSymbolsSpent[1].invocation.toFixed(1)} / ${analytics.averageSymbolsSpent[1].attack.toFixed(1)} / ${analytics.averageSymbolsSpent[1].movement.toFixed(1)}`
                                    : "Non mesuré"
                            }
                        />
                        <MetricCard
                            label="Symboles dépensés / match (Inv/Att/Mvt) · J2"
                            value={
                                analytics.averageSymbolsSpent[2]
                                    ? `${analytics.averageSymbolsSpent[2].invocation.toFixed(1)} / ${analytics.averageSymbolsSpent[2].attack.toFixed(1)} / ${analytics.averageSymbolsSpent[2].movement.toFixed(1)}`
                                    : "Non mesuré"
                            }
                        />
                        <MetricCard
                            label="Perte nette de conversion / match · J1"
                            value={
                                analytics.averageConversionLosses[1]?.toFixed(1) ?? "Non mesuré"
                            }
                        />
                        <MetricCard
                            label="Perte nette de conversion / match · J2"
                            value={
                                analytics.averageConversionLosses[2]?.toFixed(1) ?? "Non mesuré"
                            }
                        />
                        <MetricCard
                            label="Positions explorées / match · J1"
                            value={analytics.averagePositionsExplored[1].toFixed(1)}
                        />
                    </div>

                    <div className="simulation-chart-grid">
                        <MetricBarChart
                            title="Apparitions par monstre"
                            valueLabel="invocations"
                            bars={analytics.monsters.map((monster) => ({
                                label: monster.name,
                                value: monster.appearances,
                            }))}
                        />
                        <MetricBarChart
                            title="Dégâts moyens par attaque"
                            valueLabel="dégâts moyens"
                            bars={analytics.monsters
                                .filter((monster) => monster.attacks > 0)
                                .map((monster) => ({
                                    label: monster.name,
                                    value: monster.averageDamage,
                                }))
                                .sort((first, second) => second.value - first.value)}
                        />
                        <MetricBarChart
                            title="Répartition des durées"
                            valueLabel="matchs"
                            bars={analytics.turnDistribution.map(({ turns, matches }) => ({
                                label: `${turns} tours`,
                                value: matches,
                            }))}
                        />
                        <MetricBarChart
                            title="Victoires par profil"
                            valueLabel="victoires"
                            bars={BOT_PROFILES.map((profile) => ({
                                label: BOT_PROFILE_LABELS[profile],
                                value: analytics.winsByProfile[profile] ?? 0,
                            }))}
                        />
                    </div>

                    <div className="simulation-table-wrap">
                        <h4>Tableau par monstre</h4>
                        <table className="simulation-table">
                            <thead>
                                <tr>
                                    <th>Monstre</th>
                                    <th>Invocations</th>
                                    <th>Matchs avec apparition</th>
                                    <th>Attaques</th>
                                    <th>Dégâts moyens / attaque</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analytics.monsters.map((monster) => (
                                    <tr key={monster.id}>
                                        <th scope="row">{monster.name}</th>
                                        <td>{monster.appearances}</td>
                                        <td>{monster.matchesSeen}</td>
                                        <td>{monster.attacks}</td>
                                        <td>{monster.averageDamage.toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <MatchInspector
                        matches={data.matches}
                        configuration={data.configuration}
                        selectedMatchId={selectedMatchId}
                        onMatchChange={setSelectedMatchId}
                    />
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
