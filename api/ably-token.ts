import { randomUUID } from "node:crypto";
import Ably from "ably";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

export default async function handler(
    request: VercelRequest,
    response: VercelResponse,
): Promise<void> {
    if (request.method !== "GET") {
        response.setHeader("Allow", "GET");
        response.status(405).json({ error: "Méthode non autorisée." });
        return;
    }

    const roomCode = request.query.roomCode;
    if (typeof roomCode !== "string" || !ROOM_CODE_PATTERN.test(roomCode)) {
        response.status(400).json({ error: "Code de salle invalide." });
        return;
    }

    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) {
        response.status(500).json({ error: "La clé API Ably n'est pas configurée." });
        return;
    }

    try {
        const ably = new Ably.Rest({ key: apiKey });
        const channelName = `dungeon-dice:room:${roomCode}`;
        const tokenRequest = await ably.auth.createTokenRequest({
            clientId: randomUUID(),
            capability: JSON.stringify({
                [channelName]: ["publish", "subscribe", "presence"],
            }),
            ttl: 60 * 60 * 1000,
        });

        response.status(200).json(tokenRequest);
    } catch (error) {
        console.error("Échec de création du jeton Ably.", error);
        response.status(500).json({ error: "Impossible de créer le jeton Ably." });
    }
}
