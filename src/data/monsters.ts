import type { Monster } from "../types/GameTypes";

export const MONSTERS: Monster[] = [
    {
        id: "pirate",
        name: "Pirate",
        symbol: "P",
        color: 0x993f00,
        cost: 2,
        hp: 5,
        attacks: [
            {
                name: "Corps à corps",
                damage: 2,
                cost: 1,
                pattern: { type: "directionalArea", width: 3, depth: 1 },
            },
        ],
        movementRange: 2,
    },

    {
        id: "frost-mage",
        name: "Mage de Givre",
        symbol: "M",
        color: 0x54b8e8,
        cost: 4,
        hp: 5,
        attacks: [
            {
                name: "Boule de Givre",
                damage: 3,
                cost: 2,
                pattern: { type: "line", range: 4, length: 3, allDirections: true },
                hitsAllies: true,
            },
        ],
        movementRange: 2,
        //flying: true,
    },

    {
        id: "ghost",
        name: "Fantôme",
        symbol: "G",
        color: 0xffffff,
        cost: 1,
        hp: 3,
        attacks: [
            /*
            {
                name: "Saut écrasant",
                damage: 1,
                cost: 3,
                pattern: { type: "jumpArea", range: 5, width: 2, depth: 2 },
                hitsAllies: true,
                movesToZone: true,
            },
            */
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
        id: "black-knight",
        name: "Chevalier Noir",
        symbol: "BK",
        color: 0x111111,
        cost: 3,
        hp: 6,
        attacks: [
            {
                name: "Corps à corps",
                damage: 2,
                cost: 1,
                pattern: { type: "adjacent" },
            },
            {
                name: "Corps à corps puissant",
                damage: 5,
                cost: 2,
                pattern: { type: "adjacent" },
            },
        ],
        movementRange: 1,
        movementCost: 1,
    },

    {
        id: "thief",
        name: "Voleur Sournois",
        symbol: "V",
        color: 0xd4b35a,
        cost: 3,
        hp: 4,
        attacks: [
            {
                name: "Corps à corps",
                damage: 2,
                cost: 1,
                pattern: { type: "adjacent" },
            },
        ],
        movementRange: 3,
        movementActionsPerTurn: 2,
        bonusDamageFromBehind: 3,
    },

    {
        id: "archer",
        name: "Archer Squelette",
        symbol: "A",
        color: 0x888888,
        cost: 1,
        hp: 2,
        attacks: [
            {
                name: "Tir précis",
                damage: 1,
                cost: 1,
                pattern: { type: "radius", range: 5 },
            },
            {
                name: "Tir chargé",
                damage: 3,
                cost: 1,
                pattern: { type: "radius", range: 5 },
                cooldownTurns: 3,
            },
        ],
        movementRange: 2,
        movementCost: 1,
    },
];
