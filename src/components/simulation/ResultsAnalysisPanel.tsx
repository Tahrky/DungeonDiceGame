import { useEffect, useRef, useState } from "react";
import {
    analyzeSimulationData,
    parseSimulationData,
    type MonsterAnalysis,
    type SimulationAnalytics,
    type SimulationData,
} from "../../simulation/analysis";
import { BOT_PROFILE_LABELS } from "../../game/botStrategy";
import { BOT_PROFILES, type SimulationBatchResult } from "../../simulation/types";
import { AttackUsageList } from "./AttackUsageList";
import { MetricBarChart } from "./MetricBarChart";
import { MatchInspector } from "./MatchInspector";
import { SortableTable, type SortableColumn } from "./SortableTable";

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

function getMonsterColumns(
    totalMatches: number,
    includeActionDetails: boolean,
): SortableColumn<MonsterAnalysis>[] {
    const columns: SortableColumn<MonsterAnalysis>[] = [
        { key: "name", label: "Monstre", getValue: (monster) => monster.name, rowHeader: true },
        { key: "appearances", label: "Invocations", getValue: (monster) => monster.appearances },
        {
            key: "matchesSeen",
            label: "Matchs avec apparition",
            getValue: (monster) => monster.matchesSeen,
            render: (monster) =>
                totalMatches > 0
                    ? `${((monster.matchesSeen / totalMatches) * 100).toFixed(1)} %`
                    : "",
        },
    ];
    if (includeActionDetails) {
        columns.push(
            {
                key: "attacks",
                label: "Attaques",
                getValue: (monster) => monster.attacks,
                render: (monster) => (monster.attacks > 0 ? monster.attacks : ""),
            },
            {
                key: "totalDamage",
                label: "Dégâts totaux",
                getValue: (monster) => monster.totalDamage,
                render: (monster) => (monster.totalDamage > 0 ? monster.totalDamage : ""),
            },
            {
                key: "movements",
                label: "Déplacements cumulés",
                getValue: (monster) => monster.movements,
            },
            {
                key: "averageMovements",
                label: "Déplacements moyens / invocation",
                getValue: (monster) => monster.averageMovements,
                render: (monster) => monster.averageMovements.toFixed(2),
            },
            {
                key: "attackUsage",
                label: "Attaques les plus utilisées",
                getValue: (monster) =>
                    monster.attackUsage.reduce((total, attack) => total + attack.uses, 0),
                render: (monster) => <AttackUsageList attacks={monster.attackUsage} />,
            },
        );
    }
    return columns;
}

export function ResultsAnalysisPanel({ generatedResult }: ResultsAnalysisPanelProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [data, setData] = useState<SimulationData | null>(null);
    const [analytics, setAnalytics] = useState<SimulationAnalytics | null>(null);
    const [selectedMatchId, setSelectedMatchId] = useState("");
    const [activeTab, setActiveTab] = useState<"general" | "match">("general");
    const [fileName, setFileName] = useState("");
    const [error, setError] = useState("");
    const hasDetailedHistory = data?.matches.every((match) => match.history.length > 0) ?? true;

    useEffect(() => {
        if (!generatedResult) return;
        const parsed = parseSimulationData(generatedResult);
        if (!parsed) return;
        setData(parsed);
        setAnalytics(analyzeSimulationData(parsed));
        setSelectedMatchId(String(parsed.matches[0]?.id ?? ""));
        setActiveTab("general");
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
            setActiveTab("general");
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
            {data && !hasDetailedHistory && (
                <p className="simulation-description" role="status">
                    Les résultats légers ne conservent pas les actions détaillées. Les statistiques
                    d’attaques, de dégâts et de déplacements par monstre ne sont pas disponibles.
                </p>
            )}

            {data && analytics ? (
                <>
                    <div className="simulation-tabs" role="tablist" aria-label="Vue des résultats">
                        <button
                            id="simulation-general-tab"
                            type="button"
                            role="tab"
                            aria-selected={activeTab === "general"}
                            aria-controls="simulation-general-panel"
                            className={activeTab === "general" ? "is-active" : ""}
                            onClick={() => setActiveTab("general")}
                        >
                            Statistiques générales
                        </button>
                        <button
                            id="simulation-match-tab"
                            type="button"
                            role="tab"
                            aria-selected={activeTab === "match"}
                            aria-controls="simulation-match-panel"
                            className={activeTab === "match" ? "is-active" : ""}
                            onClick={() => setActiveTab("match")}
                        >
                            Statistiques d’une partie
                        </button>
                    </div>

                    {activeTab === "general" ? (
                        <div
                            id="simulation-general-panel"
                            role="tabpanel"
                            aria-labelledby="simulation-general-tab"
                        >
                            <div className="simulation-metrics">
                                <MetricCard
                                    label="Matchs analysés"
                                    value={String(data.matches.length)}
                                />
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
                            </div>

                            <div className="simulation-chart-grid">
                                <MetricBarChart
                                    title="Victoires par profil"
                                    valueLabel="victoires"
                                    bars={BOT_PROFILES.map((profile) => ({
                                        label: BOT_PROFILE_LABELS[profile],
                                        value: analytics.winsByProfile[profile] ?? 0,
                                    }))}
                                />
                                <MetricBarChart
                                    title="Durée des parties"
                                    valueLabel="matchs"
                                    bars={analytics.turnDistribution.map(({ turns, matches }) => ({
                                        label: `${turns} tours`,
                                        value: matches,
                                    }))}
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
                                {hasDetailedHistory && (
                                    <MetricBarChart
                                        title="Dégâts totaux par monstre"
                                        valueLabel="dégâts"
                                        bars={analytics.monsters
                                            .filter((monster) => monster.totalDamage > 0)
                                            .map((monster) => ({
                                                label: monster.name,
                                                value: monster.totalDamage,
                                            }))
                                            .sort((first, second) => second.value - first.value)}
                                    />
                                )}
                            </div>

                            <div className="simulation-table-wrap">
                                <h4>Tableau général par monstre</h4>
                                <SortableTable
                                    rows={analytics.monsters}
                                    columns={getMonsterColumns(
                                        data.matches.length,
                                        hasDetailedHistory,
                                    )}
                                    getRowKey={(monster) => monster.id}
                                />
                            </div>
                        </div>
                    ) : (
                        <div
                            id="simulation-match-panel"
                            role="tabpanel"
                            aria-labelledby="simulation-match-tab"
                        >
                            <MatchInspector
                                matches={data.matches}
                                configuration={data.configuration}
                                selectedMatchId={selectedMatchId}
                                onMatchChange={setSelectedMatchId}
                            />
                        </div>
                    )}
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
