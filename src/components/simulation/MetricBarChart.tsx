export interface MetricBar {
    label: string;
    value: number;
}

interface MetricBarChartProps {
    readonly title: string;
    readonly bars: readonly MetricBar[];
    readonly valueLabel: string;
}

export function MetricBarChart({ title, bars, valueLabel }: MetricBarChartProps) {
    const rowHeight = 32;
    const chartHeight = Math.max(90, bars.length * rowHeight + 20);
    const maximum = Math.max(1, ...bars.map(({ value }) => value));

    return (
        <div className="simulation-chart">
            <h4>{title}</h4>
            {bars.length === 0 ? (
                <p className="simulation-empty">Aucune donnée à représenter.</p>
            ) : (
                <svg
                    viewBox={`0 0 720 ${chartHeight}`}
                    role="img"
                    aria-label={`${title} — ${valueLabel}`}
                >
                    {bars.map(({ label, value }, index) => {
                        const y = index * rowHeight + 10;
                        const width = (value / maximum) * 390;
                        return (
                            <g key={label}>
                                <text x="0" y={y + 15} className="chart-label">
                                    {label.length > 27 ? `${label.slice(0, 25)}…` : label}
                                </text>
                                <rect
                                    x="245"
                                    y={y}
                                    width={Math.max(value > 0 ? 2 : 0, width)}
                                    height="20"
                                    rx="4"
                                    className="chart-bar"
                                />
                                <text x={255 + width} y={y + 15} className="chart-value">
                                    {valueLabel === "dégâts moyens"
                                        ? value.toFixed(2)
                                        : value.toFixed(1)}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            )}
        </div>
    );
}
