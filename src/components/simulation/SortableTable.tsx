import { useState } from "react";
import type { ReactNode } from "react";
import { sortTableRows, type SortableValue, type SortDirection } from "./tableSorting";

export interface SortableColumn<Row> {
    key: string;
    label: string;
    headerTitle?: string;
    getValue: (row: Row) => SortableValue;
    render?: (row: Row) => ReactNode;
    rowHeader?: boolean;
}

interface SortableTableProps<Row> {
    readonly rows: readonly Row[];
    readonly columns: readonly SortableColumn<Row>[];
    readonly getRowKey: (row: Row) => string;
}

interface SortState {
    key: string;
    direction: SortDirection;
}

export function SortableTable<Row>({ rows, columns, getRowKey }: SortableTableProps<Row>) {
    const [sort, setSort] = useState<SortState | null>(null);
    const sortColumn = sort ? columns.find((column) => column.key === sort.key) : undefined;
    const sortedRows =
        sort && sortColumn ? sortTableRows(rows, sortColumn.getValue, sort.direction) : rows;

    function toggleSort(key: string): void {
        setSort((current) => ({
            key,
            direction:
                current?.key === key && current.direction === "ascending"
                    ? "descending"
                    : "ascending",
        }));
    }

    return (
        <table className="simulation-table">
            <thead>
                <tr>
                    {columns.map((column) => {
                        const active = sort?.key === column.key;
                        const direction = active ? sort.direction : "ascending";
                        return (
                            <th
                                key={column.key}
                                scope="col"
                                aria-sort={active ? sort.direction : "none"}
                            >
                                <button
                                    className="simulation-table-sort-button"
                                    type="button"
                                    title={column.headerTitle}
                                    aria-label={`Trier par ${column.label} par ordre ${direction === "ascending" ? "croissant" : "décroissant"}`}
                                    onClick={() => toggleSort(column.key)}
                                >
                                    {column.label}
                                    {active ? (direction === "ascending" ? " ↑" : " ↓") : ""}
                                </button>
                            </th>
                        );
                    })}
                </tr>
            </thead>
            <tbody>
                {sortedRows.map((row) => (
                    <tr key={getRowKey(row)}>
                        {columns.map((column) => {
                            const content = column.render
                                ? column.render(row)
                                : String(column.getValue(row) ?? "");
                            return column.rowHeader ? (
                                <th key={column.key} scope="row">
                                    {content}
                                </th>
                            ) : (
                                <td key={column.key}>{content}</td>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
