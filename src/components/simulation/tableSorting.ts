export type SortableValue = string | number | null;
export type SortDirection = "ascending" | "descending";

export function sortTableRows<Row>(
    rows: readonly Row[],
    getValue: (row: Row) => SortableValue,
    direction: SortDirection,
): Row[] {
    return [...rows].sort((first, second) => {
        const firstValue = getValue(first);
        const secondValue = getValue(second);
        if (firstValue === null) return secondValue === null ? 0 : 1;
        if (secondValue === null) return -1;

        const comparison =
            typeof firstValue === "number" && typeof secondValue === "number"
                ? firstValue - secondValue
                : String(firstValue).localeCompare(String(secondValue), undefined, {
                      numeric: true,
                      sensitivity: "base",
                  });
        return direction === "ascending" ? comparison : -comparison;
    });
}
