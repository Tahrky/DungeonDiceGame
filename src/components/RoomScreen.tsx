import { useState } from "react";

interface RoomScreenProps {
    readonly roomCode: string;
    readonly isHost: boolean;
    readonly roomStatus: "connecting" | "connected" | "error";
    readonly playerCount: number;
    readonly roomError: string;
    readonly onBack: () => void;
    readonly onJoinRoom: (code: string) => void;
}

export function RoomScreen({
    roomCode,
    isHost,
    roomStatus,
    playerCount,
    roomError,
    onBack,
    onJoinRoom,
}: RoomScreenProps) {
    const [joinCode, setJoinCode] = useState("");
    const [notice, setNotice] = useState("");

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
        if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) {
            setNotice("Saisissez un code de salle valide de 8 caractères.");
            return;
        }
        onJoinRoom(code);
        setNotice("");
    }

    const statusMessage = !roomCode
        ? "Saisissez le code de salle reçu de votre adversaire."
        : roomStatus === "error"
          ? roomError
          : roomStatus === "connecting"
            ? "Connexion sécurisée à Ably en cours…"
            : `Connecté · ${playerCount}/2 joueur${playerCount === 1 ? "" : "s"} dans la salle`;

    return (
        <section id="menu-screen" aria-live="polite">
            <section id="room-screen" className="menu-panel">
                <button className="back-button" onClick={onBack}>
                    ← Retour au menu
                </button>
                <p className="eyebrow">DUEL ENTRE JOUEURS</p>
                <h2>
                    {isHost
                        ? "Inviter un joueur"
                        : roomCode
                          ? "Salle multijoueur"
                          : "Rejoindre une salle"}
                </h2>
                <p className="panel-description">
                    {isHost
                        ? "Partagez ce code. La partie démarre automatiquement lorsque l’adversaire rejoint."
                        : roomCode
                          ? "Vous êtes connecté à la salle. Gardez cette page ouverte en attendant le démarrage."
                          : "Saisissez le code à huit caractères communiqué par l’hôte."}
                </p>
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
                            maxLength={8}
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
                <output className="notice" aria-live="polite">
                    {roomError || notice || statusMessage}
                </output>
                <p className="room-disclaimer">
                    Prototype : l’hôte contrôle l’état de la partie. Les jetons Ably sont limités à
                    cette salle, mais les actions ne sont pas validées par un serveur anti-triche.
                </p>
            </section>
        </section>
    );
}
