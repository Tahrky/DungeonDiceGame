import { useState } from "react";

import { ROOM_CODE_LENGTH, ROOM_CODE_PATTERN } from "../app/roomProtocol";
import type { RoomStatus } from "../app/types";
import { MenuScreen } from "./common/MenuScreen";
import { Notice } from "./common/Notice";

interface RoomScreenProps {
    readonly roomCode: string;
    readonly isHost: boolean;
    readonly roomStatus: RoomStatus;
    readonly playerCount: number;
    readonly roomError: string;
    readonly onBack: () => void;
    readonly onJoinRoom: (code: string) => void;
}

const ROOM_TEXTS = {
    host: {
        title: "Inviter un joueur",
        description:
            "Partagez ce code. La partie démarre automatiquement lorsque l’adversaire rejoint.",
    },
    guest: {
        title: "Salle multijoueur",
        description:
            "Vous êtes connecté à la salle. Gardez cette page ouverte en attendant le démarrage.",
    },
    join: {
        title: "Rejoindre une salle",
        description: "Saisissez le code à huit caractères communiqué par l’hôte.",
    },
};

function getRoomTexts(isHost: boolean, hasCode: boolean) {
    if (isHost) return ROOM_TEXTS.host;
    return hasCode ? ROOM_TEXTS.guest : ROOM_TEXTS.join;
}

function getStatusMessage({
    roomCode,
    roomStatus,
    playerCount,
    roomError,
}: Pick<RoomScreenProps, "roomCode" | "roomStatus" | "playerCount" | "roomError">): string {
    if (!roomCode) return "Saisissez le code de salle reçu de votre adversaire.";
    if (roomStatus === "error") return roomError;
    if (roomStatus === "connecting") return "Connexion sécurisée à Ably en cours…";
    return `Connecté · ${playerCount}/2 joueur${playerCount === 1 ? "" : "s"} dans la salle`;
}

export function RoomScreen(props: RoomScreenProps) {
    const { roomCode, isHost, roomError, onBack, onJoinRoom } = props;
    const [joinCode, setJoinCode] = useState("");
    const [notice, setNotice] = useState("");
    const { title, description } = getRoomTexts(isHost, roomCode !== "");

    async function copyRoomCode(): Promise<void> {
        try {
            await navigator.clipboard.writeText(roomCode);
            setNotice("Code copié dans le presse-papiers.");
        } catch {
            setNotice("Copie impossible dans ce navigateur. Sélectionnez le code pour le copier.");
        }
    }

    function joinRoom(): void {
        const code = joinCode.trim().toUpperCase();
        if (!ROOM_CODE_PATTERN.test(code)) {
            setNotice("Saisissez un code de salle valide de 8 caractères.");
            return;
        }
        onJoinRoom(code);
        setNotice("");
    }

    return (
        <MenuScreen
            panelId="room-screen"
            isLive
            backLabel="Retour au menu"
            onBack={onBack}
            eyebrow="DUEL ENTRE JOUEURS"
            title={title}
            description={description}
        >
            {roomCode && (
                <div className="room-code-card">
                    <span>CODE DE LA SALLE</span>
                    <strong>{roomCode}</strong>
                    <button className="secondary-button" onClick={copyRoomCode}>
                        Copier le code
                    </button>
                </div>
            )}
            <div className="room-join">
                <label htmlFor="join-room-code">Ou rejoindre avec un code</label>
                <div className="room-join-row">
                    <input
                        id="join-room-code"
                        maxLength={ROOM_CODE_LENGTH}
                        autoComplete="off"
                        placeholder="EX. A4K9Q2R7"
                        value={joinCode}
                        onChange={(event) => setJoinCode(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") joinRoom();
                        }}
                    />
                    <button className="primary-button" onClick={joinRoom}>
                        Rejoindre
                    </button>
                </div>
            </div>
            <Notice aria-live="polite">{roomError || notice || getStatusMessage(props)}</Notice>
            <p className="room-disclaimer">
                Prototype : l’hôte contrôle l’état de la partie. Les jetons Ably sont limités à
                cette salle, mais les actions ne sont pas validées par un serveur anti-triche.
            </p>
        </MenuScreen>
    );
}
