import { BOT_PROFILE_LABELS } from "../../game/botStrategy";
import type { SimulationAnalytics } from "../../simulation/analysis";
import { BOT_PROFILES } from "../../simulation/types";
import { getAnalysisMonsterColumns } from "./analysisMonsterColumns";
import { MetricBarChart } from "./MetricBarChart";
import { OutcomeTable } from "./OutcomeTable";
import { SortableTable } from "./SortableTable";

interface GeneralStatisticsProps {
    readonly matchCount: number;
    readonly analytics: SimulationAnalytics;
    readonly hasDetailedHistory: boolean;
}

const RELIABILITY_LEVELS: readonly (readonly [number, string])[] = [
    [50, "Échantillon faible : diagnostic initial seulement (< 50 matchs)."],
    [100, "Premières tendances observables (50–99 matchs), à confirmer."],
    [200, "Tendance exploratoire (100–199 matchs); l’incertitude reste importante."],
    [400, "Comparaison informative, sans garantie de précision (200–399 matchs)."],
    [1000, "Échantillon conséquent (400–999 matchs), sans garantie de précision."],
];

function getReliabilityMessage(matchCount: number): string {
    return (
        RELIABILITY_LEVELS.find(([limit]) => matchCount < limit)?.[1] ??
        "Validation approfondie (1 000 matchs ou plus), sans garantie de précision."
    );
}

function getMetrics(matchCount: number, analytics: SimulationAnalytics): [string, string][] {
    return [
        ["Matchs analysés", String(matchCount)],
        ["Tours moyens", analytics.averageTurns.toFixed(1)],
        ["Monstres invoqués / match · J1", analytics.averageDeployments[1].toFixed(1)],
        ["Monstres invoqués / match · J2", analytics.averageDeployments[2].toFixed(1)],
        ["Victoires · J1", String(analytics.winsByPlayer[1])],
        ["Victoires · J2", String(analytics.winsByPlayer[2])],
        ["Victoires · PV de la base à 0", String(analytics.winsByFinishReason.baseDestroyed)],
        [
            "Victoires · élimination des monstres adverses",
            String(analytics.winsByFinishReason.monstersEliminated),
        ],
        ["Matchs nuls", String(analytics.draws)],
        ["Matchs arrêtés par limite de tours", String(analytics.turnLimitMatches)],
    ];
}

export function GeneralStatistics({
    matchCount,
    analytics,
    hasDetailedHistory,
}: GeneralStatisticsProps) {
    const { monsters, turnLimitMatches } = analytics;

    return (
        <>
            <div className="simulation-metrics">
                {getMetrics(matchCount, analytics).map(([label, value]) => (
                    <div key={label} className="simulation-metric-card">
                        <span>{label}</span>
                        <strong>{value}</strong>
                    </div>
                ))}
            </div>

            <div className="simulation-table-wrap">
                <h4>Résultats et incertitude statistique</h4>
                <p className="simulation-description">
                    Taux de victoire et intervalle de confiance à 95 % de Wilson. Les matchs nuls
                    restent dans le dénominateur; ils sont affichés séparément.
                </p>
                <OutcomeTable analytics={analytics} />
            </div>

            <div className="simulation-table-wrap">
                <h4>Diagnostic de fiabilité</h4>
                <p className="simulation-description" role="status">
                    {getReliabilityMessage(matchCount)} Les intervalles ne corrigent pas les
                    différences de composition, de profil, de position ou la dépendance entre
                    matchs.
                </p>
                {turnLimitMatches > 0 && (
                    <p className="simulation-description" role="status">
                        {turnLimitMatches} match(s) sur {matchCount} se sont terminés par limite de
                        tours; leurs résultats ne sont pas équivalents à une victoire par
                        élimination ou base détruite.
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
                    bars={monsters.map((monster) => ({
                        label: monster.name,
                        value: monster.appearances,
                    }))}
                />
                {hasDetailedHistory && (
                    <MetricBarChart
                        title="Dégâts totaux par monstre"
                        valueLabel="dégâts"
                        bars={monsters
                            .filter((monster) => monster.totalDamage > 0)
                            .map((monster) => ({ label: monster.name, value: monster.totalDamage }))
                            .sort((first, second) => second.value - first.value)}
                    />
                )}
            </div>

            <div className="simulation-table-wrap">
                <h4>Tableau général par monstre</h4>
                <SortableTable
                    rows={monsters}
                    columns={getAnalysisMonsterColumns(matchCount, hasDetailedHistory)}
                    getRowKey={(monster) => monster.id}
                />
            </div>
        </>
    );
}
