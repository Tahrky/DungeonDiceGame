import { describe, expect, it } from "vitest";
import { sortTableRows } from "../src/components/simulation/tableSorting";

describe("tri des tableaux d’analyse", () => {
    it("trie les nombres et garde les valeurs manquantes à la fin dans les deux sens", () => {
        const rows = [{ value: 3 }, { value: null }, { value: 1 }, { value: 2 }];

        expect(sortTableRows(rows, (row) => row.value, "ascending")).toEqual([
            { value: 1 },
            { value: 2 },
            { value: 3 },
            { value: null },
        ]);
        expect(sortTableRows(rows, (row) => row.value, "descending")).toEqual([
            { value: 3 },
            { value: 2 },
            { value: 1 },
            { value: null },
        ]);
        expect(rows[0]?.value).toBe(3);
    });
});
