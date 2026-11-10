import type { Monster } from "../types/GameTypes";

export const MONSTERS: Monster[] = [
    {
        id: "golem",
        name: "Golem de glace",
        symbol: "G",
        color: 0x54b8e8,
        cost: 2,
        hp: 5,
        attacks: [
            {
                name: "Corps à corps",
                damage: 2,
                cost: 1,
                pattern: { type: "adjacent" },
            },
        ],
        movementRange: 2,
    },

    {
        id: "dragon",
        name: "Dragon de feu",
        symbol: "D",
        color: 0xe45b3e,
        cost: 4,
        hp: 8,
        attacks: [
            {
                name: "Souffle enflammé",
                damage: 3,
                cost: 1,
                pattern: { type: "line", range: 4, length: 3, allDirections: true },
                hitsAllies: true,
            },
        ],
        movementRange: 2,
        flying: true,
    },

    {
        id: "slime",
        name: "Slime forestier",
        symbol: "S",
        color: 0x75c75a,
        cost: 1,
        hp: 3,
        attacks: [
            {
                name: "Saut écrasant",
                damage: 1,
                cost: 3,
                pattern: { type: "jumpArea", range: 5, width: 2, depth: 2 },
                hitsAllies: true,
                movesToZone: true,
            },
            {
                name: "Coup au corps à corps",
                damage: 1,
                cost: 1,
                pattern: { type: "adjacent" },
            },
        ],
        movementRange: 2,
        movementCost: 0,
    },

    {
        id: "knight",
        name: "Chevalier guépardg",
        symbol: "K",
        color: 0xa17bd4,
        cost: 0,
        hp: 6,
        attacks: [
            {
                name: "Corps à corps",
                damage: 2,
                cost: 0,
                pattern: { type: "adjacent" },
            },
            {
                name: "Corps à corps puissant",
                damage: 4,
                cost: 0,
                pattern: { type: "adjacent" },
            },
        ],
        movementRange: 2,
        movementCost: 0,
    },
    {
        id: "sneaky-thief",
        name: "Voleur sournois",
        symbol: "V",
        color: 0xd4b35a,
        cost: 3,
        hp: 4,
        attacks: [
            {
                name: "Corps à corps",
                damage: 1,
                cost: 1,
                pattern: { type: "adjacent" },
            },
        ],
        movementRange: 3,
        bonusDamageFromBehind: 2,
    },
    {
        id: "skeleton-archer",
        name: "Archer squelette",
        symbol: "A",
        color: 0xc7c8c3,
        cost: 2,
        hp: 3,
        attacks: [
            {
                name: "Tir précis",
                damage: 1,
                cost: 1,
                pattern: { type: "radius", range: 5 },
            },
        ],
        movementRange: 2,
    },
    {
        id: "gnome-archer",
        name: "Arbalétrier gnome",
        symbol: "AG",
        color: 0xc7c8c3,
        cost: 4,
        hp: 3,
        attacks: [
            {
                name: "Tir précis",
                damage: 2,
                cost: 1,
                pattern: { type: "radius", range: 7 },
            },
        ],
        movementRange: 2,
    },
];
