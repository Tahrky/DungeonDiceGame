import { useEffect, useRef, useState } from "react";
import {
    analyzeSimulationData,
    parseSimulationData,
    type MonsterAnalysis,
    type OutcomeRate,
    type SimulationAnalytics,
    type SimulationData,
} from "../../simulation/analysis";
import { BOT_PROFILE_LABELS } from "../../game/botStrategy";
import { BOT_PROFILES, type SimulationBatchResult } from "../../simulation/types";
import { createSimulationJsonBlob } from "../../simulation/export";
import { AttackUsageList } from "./AttackUsageList";
import { MetricBarChart } from "./MetricBarChart";
import { MatchInspector } from "./MatchInspector";
import { SortableTable, type SortableColumn } from "./SortableTable";

interface ResultsAnalysisPanelProps {
    readonly generatedResult: SimulationBatchResult | null;
}

function downloadJson(result: SimulationBatchResult): void {
    const url = URL.createObjectURL(createSimulationJsonBlob(result));
    const link = document.createElement("a");
    link.href = url;
    link.download = `dungeon-dice-simulations-seed-${result.options.seed}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
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
                key: "directDamage",
                label: "Dégâts directs",
                getValue: (monster) => monster.directDamage,
            },
            {
                key: "damageOverTime",
                label: "Dégâts différés",
                headerTitle: "Dégâts enregistrés par les événements de statut, comme le poison.",
                getValue: (monster) => monster.damageOverTime,
            },
            {
                key: "attacksWithDamage",
                label: "Attaques avec dégâts",
                headerTitle: "Attaques ayant infligé au moins un dégât selon l’historique.",
                getValue: (monster) => monster.attacksWithDamage,
            },
            {
                key: "kills",
                label: "Éliminations",
                headerTitle: "Éliminations identifiées dans la cible de l’événement d’attaque.",
                getValue: (monster) => monster.kills,
            },
            {
                key: "averageFirstInvocationTurn",
                label: "Tour moyen de 1re invocation",
                getValue: (monster) => monster.averageFirstInvocationTurn,
                render: (monster) =>
                    monster.averageFirstInvocationTurn === null
                        ? "–"
                        : monster.averageFirstInvocationTurn.toFixed(1),
            },
            {
                key: "resourceCosts",
                label: "Ressources dépensées",
                headerTitle: "Coûts réellement présents dans les événements du rapport.",
                getValue: (monster) =>
                    monster.resourceCosts === null
                        ? null
                        : Object.values(monster.resourceCosts).reduce(
                              (total, cost) => total + cost,
                              0,
                          ),
                render: (monster) =>
                    monster.resourceCosts === null
                        ? "Indisponible"
                        : Object.values(monster.resourceCosts).reduce(
                              (total, cost) => total + cost,
                              0,
                          ),
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

function formatRate(rate: OutcomeRate | undefined): string {
    if (!rate || rate.winRate === null || !rate.confidenceInterval) return "Indisponible";
    const percentage = (value: number) => `${(value * 100).toFixed(1)} %`;
    return `${rate.wins}/${rate.matches} · ${percentage(rate.winRate)} (${percentage(rate.confidenceInterval.lowerBound)}–${percentage(rate.confidenceInterval.upperBound)})`;
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
                        onClick={() => {
                            setError("");
                            try {
                                downloadJson(generatedResult);
                            } catch (caught) {
                                setError(
                                    caught instanceof Error
                                        ? `Impossible de télécharger le JSON : ${caught.message}`
                                        : "Impossible de préparer le téléchargement JSON.",
                                );
                            }
                        }}
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
                                <MetricCard
                                    label="Matchs arrêtés par limite de tours"
                                    value={String(analytics.turnLimitMatches)}
                                />
                            </div>

                            <div className="simulation-table-wrap">
                                <h4>Résultats et incertitude statistique</h4>
                                <p className="simulation-description">
                                    Taux de victoire et intervalle de confiance à 95 % de Wilson.
                                    Les matchs nuls restent dans le dénominateur; ils sont affichés
                                    séparément.
                                </p>
                                <table className="simulation-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">Comparaison</th>
                                            <th scope="col">Victoires / matchs · taux (IC 95 %)</th>
                                            <th scope="col">Nuls</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {([1, 2] as const).map((player) => (
                                            <tr key={`player-${player}`}>
                                                <th scope="row">J{player}</th>
                                                <td>{formatRate(analytics.playerOutcomes[player])}</td>
                                                <td>{analytics.playerOutcomes[player].draws}</td>
                                            </tr>
                                        ))}
                                        {([1, 2] as const).map((player) => (
                                            <tr key={`starting-player-${player}`}>
                                                <th scope="row">J{player} commence</th>
                                                <td>
                                                    {formatRate(
                                                        analytics.startingPlayerOutcomes[player],
                                                    )}
                                                </td>
                                                <td>
                                                    {analytics.startingPlayerOutcomes[player].draws}
                                                </td>
                                            </tr>
                                        ))}
                                        {BOT_PROFILES.filter(
                                            (profile) => analytics.profileOutcomes[profile],
                                        ).map((profile) => (
                                            <tr key={profile}>
                                                <th scope="row">
                                                    {BOT_PROFILE_LABELS[profile]}
                                                </th>
                                                <td>
                                                    {formatRate(
                                                        analytics.profileOutcomes[profile],
                                                    )}
                                                </td>
                                                <td>
                                                    {analytics.profileOutcomes[profile]?.draws ?? 0}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="simulation-table-wrap">
                                <h4>Diagnostic de fiabilité</h4>
                                <p className="simulation-description" role="status">
                                    {data.matches.length < 50
                                        ? "Échantillon faible : diagnostic initial seulement (< 50 matchs)."
                                        : data.matches.length < 100
                                          ? "Premières tendances observables (50–99 matchs), à confirmer."
                                          : data.matches.length < 200
                                            ? "Tendance exploratoire (100–199 matchs); l’incertitude reste importante."
                                            : data.matches.length < 400
                                              ? "Comparaison informative, sans garantie de précision (200–399 matchs)."
                                                : data.matches.length < 1000
                                                  ? "Échantillon conséquent (400–999 matchs), sans garantie de précision."
                                                  : "Validation approfondie (1 000 matchs ou plus), sans garantie de précision."}
                                    {" "}Les intervalles ne corrigent pas les différences de composition,
                                    de profil, de position ou la dépendance entre matchs.
                                </p>
                                {analytics.turnLimitMatches > 0 && (
                                    <p className="simulation-description" role="status">
                                        {analytics.turnLimitMatches} match(s) sur {data.matches.length}{" "}
                                        se sont terminés par limite de tours; leurs résultats ne
                                        sont pas équivalents à une victoire par élimination ou base
                                        détruite.
                                    </p>
                                )}
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
