import { randomUUID } from "node:crypto";
import { createHttpClient } from "@ably/pubsub-server";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

export async function createAblyTokenResponse(
    method: string | undefined,
    roomCode: unknown,
): Promise<{ status: number; body: unknown }> {
    if (method !== "GET") return { status: 405, body: { error: "Méthode non autorisée." } };
    if (typeof roomCode !== "string" || !ROOM_CODE_PATTERN.test(roomCode)) {
        return { status: 400, body: { error: "Code de salle invalide." } };
    }

    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) {
        return { status: 500, body: { error: "La clé API Ably n'est pas configurée." } };
    }

    try {
        const ably = createHttpClient({ key: apiKey });
        const channelName = `dungeon-dice:room:${roomCode}`;
        const tokenRequest = await ably.auth.createTokenRequest({
            clientId: randomUUID(),
            capability: JSON.stringify({
                [channelName]: ["publish", "subscribe", "presence"],
            }),
            ttl: 60 * 60 * 1000,
        });

        return { status: 200, body: tokenRequest };
    } catch (error) {
        console.error("Échec de création du jeton Ably.", error);
        return { status: 500, body: { error: "Impossible de créer le jeton Ably." } };
    }
}

export default async function handler(
    request: VercelRequest,
    response: VercelResponse,
): Promise<void> {
    const result = await createAblyTokenResponse(request.method, request.query.roomCode);
    if (result.status === 405) response.setHeader("Allow", "GET");
    response.status(result.status).json(result.body);
}
