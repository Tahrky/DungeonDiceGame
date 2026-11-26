import { Fragment } from "react";
import { PLAYER_IDS } from "../../game/matchRules";
import { getUniqueMonsterSymbols } from "../../game/monsterSymbols";
import {
    analyzeMatchMonsters,
    type AnalyzableMatch,
    type SimulationAnalysisConfiguration,
} from "../../simulation/analysis";
import { HISTORY_COLUMNS, getMatchMonsterColumns } from "./matchColumns";
import { SimulationBoard } from "./SimulationBoard";
import { SortableTable } from "./SortableTable";

interface MatchDetailsProps {
    readonly match: AnalyzableMatch;
    readonly configuration: SimulationAnalysisConfiguration;
}

const MAX_VISIBLE_EVENTS = 500;

function formatLastSummonTurn(turn: number | null | undefined): string {
    if (turn === undefined) return "non renseignée";
    return turn === null ? "limite non atteinte" : `tour ${turn}`;
}

function formatActionDiagnostics(stats: AnalyzableMatch["statistics"][1]): string {
    return [
        `${stats.turnsWithoutUsefulAction ?? "—"} tours sans action utile`,
        `${stats.stagnantMonsterTurns ?? "—"} blocages de déplacement de monstres (cumulés)`,
        `${stats.unreachableObjectives ?? "—"} objectifs inaccessibles`,
        `${stats.blockedInvocationAttempts ?? "—"} invocations bloquées`,
    ].join(", ");
}

export function MatchDetails({ match, configuration }: MatchDetailsProps) {
    const visibleHistory = match.history.slice(-MAX_VISIBLE_EVENTS);
    const hasDetailedHistory = match.history.length > 0;
    const hasActionDiagnostics = PLAYER_IDS.some(
        (player) => match.statistics[player].turnsWithoutUsefulAction !== undefined,
    );
    const monsterColumns = getMatchMonsterColumns(
        getUniqueMonsterSymbols(configuration.monsters),
        hasDetailedHistory,
    );

    return (
        <>
            <div className="simulation-board-summary">
                {PLAYER_IDS.map((player) => (
                    <Fragment key={player}>
                        <span>
                            J{player} : {match.profiles[player]} ·{" "}
                            {match.statistics[player].summoned} invoqués
                        </span>
                        <span>
                            Dernière invocation J{player} :{" "}
                            {formatLastSummonTurn(match.statistics[player].lastMonsterSummonTurn)}
                        </span>
                    </Fragment>
                ))}
                <span>{match.winner ? `Vainqueur : J${match.winner}` : "Résultat : égalité"}</span>
            </div>
            {hasActionDiagnostics && (
                <p className="simulation-description">
                    Diagnostics — J1 : {formatActionDiagnostics(match.statistics[1])} · J2 :{" "}
                    {formatActionDiagnostics(match.statistics[2])}
                </p>
            )}
            <SimulationBoard match={match} configuration={configuration} />
            {match.finalMonsters.length > 0 && (
                <div className="simulation-table-wrap">
                    <h4>Monstres en fin de match</h4>
                    <SortableTable
                        rows={analyzeMatchMonsters(match)}
                        columns={monsterColumns}
                        getRowKey={(monster) => monster.id}
                    />
                </div>
            )}
            <div className="simulation-history">
                <h4>Historique du match</h4>
                {hasDetailedHistory ? (
                    <>
                        {match.history.length > visibleHistory.length && (
                            <p className="simulation-description">
                                Les {MAX_VISIBLE_EVENTS} événements les plus récents sont affichés.
                                Le JSON conserve l’historique complet.
                            </p>
                        )}
                        <SortableTable
                            rows={visibleHistory.map((event, index) => ({ event, index }))}
                            columns={HISTORY_COLUMNS}
                            getRowKey={({ event, index }) =>
                                `${event.turn}-${event.player}-${index}`
                            }
                        />
                    </>
                ) : (
                    <p className="simulation-description">
                        L’historique détaillé n’a pas été conservé pour ce match.
                    </p>
                )}
            </div>
        </>
    );
}
