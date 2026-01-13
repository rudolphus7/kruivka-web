import { useState, useCallback, useEffect } from 'react';
import { database } from '../firebase';
import { ref, set, get, update, onValue, remove } from 'firebase/database';
import type { GameRoom, Player } from '../types/game';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_KEY = 'kruivka_user_id';
const NAME_KEY = 'kruivka_player_name';

const getMyUserId = () => {
    let id = sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY);
    if (!id) {
        id = uuidv4();
        sessionStorage.setItem(STORAGE_KEY, id);
    }
    return id;
};

export const useGame = () => {
    const [room, setRoom] = useState<GameRoom | null>(null);
    const [myUserId] = useState(getMyUserId());
    const [playerName, setPlayerName] = useState(localStorage.getItem(NAME_KEY) || "");

    useEffect(() => {
        if (playerName) localStorage.setItem(NAME_KEY, playerName);
    }, [playerName]);

    const createRoom = async (name: string, gameMode: 'open' | 'closed' = 'closed') => {
        const roomId = `UKR-${Math.floor(1000 + Math.random() * 9000)}`;
        const hostPlayer: Player = {
            userId: myUserId,
            name,
            role: 'civilian',
            alive: true,
            ready: true,
            message: '',
            knownEnemyId: null
        };

        const newRoom: GameRoom = {
            roomId,
            hostId: myUserId,
            status: 'lobby',
            gameMode,
            phase: 'lobby',
            dayNumber: 1,
            infoMessage: '',
            winner: '',
            players: { [myUserId]: hostPlayer },
            nkvdPlan: [],
            planIndex: 0,
            nightActions: {},
            speakerIndex: 0,
            nominations: {},
            votes: {},
            wasNightKill: false
        };

        await set(ref(database, `rooms/${roomId}`), newRoom);
        setPlayerName(name);
        return roomId;
    };

    const joinRoom = async (roomId: string, name: string) => {
        const roomRef = ref(database, `rooms/${roomId}`);
        const snapshot = await get(roomRef);

        if (snapshot.exists()) {
            const newPlayer: Player = {
                userId: myUserId,
                name,
                role: 'civilian',
                alive: true,
                ready: false,
                message: '',
                knownEnemyId: null
            };
            await set(ref(database, `rooms/${roomId}/players/${myUserId}`), newPlayer);
            setPlayerName(name);
        }
    };

    const leaveRoom = async (roomId: string) => {
        const myPlayerRef = ref(database, `rooms/${roomId}/players/${myUserId}`);
        await remove(myPlayerRef);

        // Check if room is empty and delete it
        const roomRef = ref(database, `rooms/${roomId}`);
        const snapshot = await get(roomRef);
        if (snapshot.exists()) {
            const room = snapshot.val();
            const playerCount = Object.keys(room.players || {}).length;
            if (playerCount === 0) {
                await remove(roomRef);
            }
        }

        setRoom(null);
        setPlayerName('');
    };

    const listenToRoom = useCallback((roomId: string) => {
        const roomRef = ref(database, `rooms/${roomId}`);
        return onValue(roomRef, (snapshot) => {
            const data = snapshot.val();
            if (data) setRoom(data);
        });
    }, []);

    const startGame = async (roomId: string, players: Player[]) => {
        if (players.length < 10) return;
        const deck: string[] = ["don", "mafia", "mafia", "sheriff", "doctor", "civilian", "civilian", "civilian", "civilian", "civilian"];
        const shuffledDeck = [...deck].sort(() => Math.random() - 0.5);

        const updates: any = {};
        const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);

        shuffledPlayers.forEach((player, index) => {
            if (index < shuffledDeck.length) {
                updates[`rooms/${roomId}/players/${player.userId}/role`] = shuffledDeck[index];
            }
        });

        updates[`rooms/${roomId}/status`] = 'playing';
        updates[`rooms/${roomId}/phase`] = 'night_zero';
        updates[`rooms/${roomId}/infoMessage`] = 'Ролі роздано. Ніч знайомства.';

        await update(ref(database), updates);

        // If Don is a bot, set the plan automatically
        const donPlayer = shuffledPlayers.find((_, i) => shuffledDeck[i] === 'don');
        if (donPlayer?.userId.startsWith('BOT')) {
            const potentialVictims = shuffledPlayers
                .filter(player => {
                    const playerRole = updates[`rooms/${roomId}/players/${player.userId}/role`];
                    return !['mafia', 'don'].includes(playerRole);
                })
                .map(player => player.userId);
            const victims = [...potentialVictims].sort(() => Math.random() - 0.5).slice(0, 3);
            await setNkvdPlan(roomId, victims);
        }
    };

    const appendDynamicPlan = async (roomId: string, targetId: string, currentPlan: string[]) => {
        const newPlan = [...currentPlan, targetId];
        await update(ref(database, `rooms/${roomId}`), {
            nkvdPlan: newPlan,
            phase: 'night',
            infoMessage: "Ціль визначено. Настає ніч."
        });
    };

    const endNight = async (roomId: string, players: Player[], roomData: GameRoom) => {
        const actionsRef = ref(database, `rooms/${roomId}/nightActions`);
        const snapshot = await get(actionsRef);
        const actions = snapshot.val() || {};
        const currentTargetId = roomData.nkvdPlan?.[roomData.planIndex];

        const aliveNkvd = players.filter(p => (p.role === 'mafia' || p.role === 'don') && p.alive);
        let killTarget: string | null = null;

        if (aliveNkvd.length > 0 && currentTargetId) {
            let successfulShots = 0;
            aliveNkvd.forEach(nkvd => {
                if (nkvd.userId.startsWith('BOT') || actions[nkvd.userId] === currentTargetId) {
                    successfulShots++;
                }
            });

            if (successfulShots === aliveNkvd.length) {
                const victim = players.find(p => p.userId === currentTargetId);
                if (victim && victim.role !== 'mafia' && victim.role !== 'don') {
                    killTarget = currentTargetId;
                }
            }
        }

        let doctorTargetId: string | null = null;
        Object.entries(actions).forEach(([actorId, targetId]) => {
            const actor = players.find(p => p.userId === actorId);
            if (actor?.role === 'doctor') doctorTargetId = targetId as string;
        });

        const updates: any = {};
        let wasNightKill = false;
        let msg = "Ніч пройшла спокійно. НКВС схибили.";

        if (killTarget) {
            if (killTarget === doctorTargetId) {
                msg = "Лікар врятував життя цієї ночі!";
                updates.lastHealedTarget = doctorTargetId; // Persist last healed
                updates[`players/${killTarget}/alive`] = true; // Just to be explicit, though it wasn't set to false yet
            } else {
                const vName = players.find(p => p.userId === killTarget)?.name || "...";
                msg = `Вбито ${vName}. Працювали професіонали.`;
                updates[`players/${killTarget}/alive`] = false;
                updates.lastHealedTarget = null; // Reset if no one was healed (or different target) - actually, standard mafia rules say you just track who was LAST healed, regardless of kill. 
                // Wait, if no heal happened, should we clear it? 
                // If Doctor healed X, and Mafia killed Y:
                // Rule: Doctor can't heal X again next night.
                // So we should update lastHealedTarget to doctorTargetId regardless of save?
                // Yes.
            }
        }

        // Actually, we must save doctorTargetId as lastHealedTarget if the doctor acted.
        if (doctorTargetId) {
            updates.lastHealedTarget = doctorTargetId;
        } else {
            // If doctor didn't act (dead or skipped), maybe clear it to allow healing anyone next time?
            // Or keep previous? Usually clear.
            updates.lastHealedTarget = null;
        }

        if (killTarget && killTarget !== doctorTargetId) {
            const vName = players.find(p => p.userId === killTarget)?.name || "...";
            msg = `Вбито ${vName}. Працювали професіонали.`;
            updates[`players/${killTarget}/alive`] = false;
            wasNightKill = true;
        } else if (killTarget && killTarget === doctorTargetId) {
            msg = "Лікар врятував життя цієї ночі!";
            updates.wasNightKill = false;
        }

        updates.phase = "day_discussion";
        updates.dayNumber = (roomData.dayNumber || 1) + 1;
        updates.nightActions = null;
        updates.planIndex = (roomData.planIndex || 0) + 1;
        updates.speakerIndex = 0;
        updates.wasNightKill = wasNightKill;
        updates.infoMessage = msg;

        await update(ref(database, `rooms/${roomId}`), updates);
        if (killTarget && killTarget !== doctorTargetId) checkWinCondition(roomId, players, killTarget);
    };

    const clearInfoMessage = (roomId: string) => {
        update(ref(database, `rooms/${roomId}`), { infoMessage: "" });
    };

    const nominatePlayer = async (roomId: string, nominatorId: string, targetId: string, currentNominations: Record<string, string>) => {
        // Enforce: One Player, One Nomination
        if (!currentNominations || !currentNominations[nominatorId]) {
            await set(ref(database, `rooms/${roomId}/nominations/${nominatorId}`), targetId);
        }
    };

    const voteForCandidate = async (roomId: string, candidateId: string) => {
        await set(ref(database, `rooms/${roomId}/votes/${myUserId}`), candidateId);
    };

    const sendNightAction = async (roomId: string, targetId: string) => {
        await set(ref(database, `rooms/${roomId}/nightActions/${myUserId}`), targetId);
    };

    const passTurn = async (roomId: string, currentSpeakerIndex: number, playersSorted: Player[], nominations: Record<string, string>, wasNightKill: boolean, planIndex: number, nkvdPlanSize: number) => {
        // Clear messages
        const playersRef = ref(database, `rooms/${roomId}/players`);
        const snapshot = await get(playersRef);
        if (snapshot.exists()) {
            const players = snapshot.val();
            const updates: any = {};
            Object.keys(players).forEach(id => {
                if (players[id].message) updates[`${id}/message`] = "";
            });
            await update(playersRef, updates);
        }

        let nextIndex = currentSpeakerIndex + 1;
        const totalPlayers = playersSorted.length;

        while (nextIndex < totalPlayers && !playersSorted[nextIndex].alive) {
            nextIndex++;
        }

        if (nextIndex >= totalPlayers) {
            const candidatesList = nominations ? Array.from(new Set(Object.values(nominations))) : [];
            if (wasNightKill && candidatesList.length > 0) {
                await update(ref(database, `rooms/${roomId}`), { phase: 'day_voting', votes: null, infoMessage: "Голосування!" });
            } else {
                const info = !wasNightKill ? "Вбивства не було. Суд скасовано." : "Нікого не висунули. Всім спати.";
                const nextPhase = planIndex >= nkvdPlanSize ? "night_planning" : "night";
                await update(ref(database, `rooms/${roomId}`), { phase: nextPhase, speakerIndex: 0, infoMessage: info });
            }
        } else {
            await set(ref(database, `rooms/${roomId}/speakerIndex`), nextIndex);
        }
    };

    const finalizeVoting = async (roomId: string, players: Player[], nominations: Record<string, string>, planIndex: number, nkvdPlanSize: number) => {
        const candidates = nominations ? Array.from(new Set(Object.values(nominations))) : [];
        const votesRef = ref(database, `rooms/${roomId}/votes`);
        const snapshot = await get(votesRef);
        const rawVotes = snapshot.val() || {};
        const finalVotes = { ...rawVotes };

        if (candidates.length === 2) {
            const [c1, c2] = candidates;
            if (!finalVotes[c1]) finalVotes[c1] = c2;
            if (!finalVotes[c2]) finalVotes[c2] = c1;
        }

        const validVotes = Object.entries(finalVotes).filter(([voterId, candId]) => voterId !== candId && candidates.includes(candId as string));
        const voteCounts: Record<string, number> = {};
        candidates.forEach(c => voteCounts[c] = validVotes.filter(([_, cid]) => cid === c).length);

        const sortedVotes = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);

        let msg = "Ніхто не повішений.";
        let deadId: string | null = null;

        if (sortedVotes.length > 0) {
            const [leaderId, leaderVotes] = sortedVotes[0];
            if (!((sortedVotes.length > 1 && sortedVotes[1][1] === leaderVotes) || leaderVotes === 0)) {
                deadId = leaderId;
                const loserName = players.find(p => p.userId === deadId)?.name || "...";
                msg = `Громада вирішила: ${loserName} повішений!`;
                await set(ref(database, `rooms/${roomId}/players/${deadId}/alive`), false);
            } else {
                msg = "Нічия. Всі живуть.";
            }
        }

        const nextPhase = planIndex >= nkvdPlanSize ? "night_planning" : "night";
        await update(ref(database, `rooms/${roomId}`), {
            phase: nextPhase,
            nominations: null,
            votes: null,
            speakerIndex: 0,
            infoMessage: msg
        });

        if (deadId) checkWinCondition(roomId, players, deadId);
    };

    const checkWinCondition = async (roomId: string, players: Player[], justDeadId: string) => {
        const activePlayers = players.map(p => p.userId === justDeadId ? { ...p, alive: false } : p);
        const nkvdCount = activePlayers.filter(p => p.alive && (p.role === 'mafia' || p.role === 'don')).length;
        const peacefulCount = activePlayers.filter(p => p.alive && p.role !== 'mafia' && p.role !== 'don').length;

        let winner = "";
        if (nkvdCount === 0) winner = "UPA";
        else if (nkvdCount >= peacefulCount) winner = "NKVD";

        if (winner) {
            await update(ref(database, `rooms/${roomId}`), {
                winner,
                status: 'finished',
                infoMessage: winner === "UPA" ? "ПЕРЕМОГА УПА!" : "НКВС ПЕРЕМОГЛО"
            });
        }
    };

    const addBots = async (roomId: string, currentPlayers: Player[]) => {
        console.log('addBots called', { roomId, currentPlayersCount: currentPlayers.length });
        const neededBots = 10 - currentPlayers.length;
        if (neededBots <= 0) {
            console.log('No bots needed');
            return;
        }

        const botUpdates: any = {};
        const botNames = ["Тарас", "Остап", "Богдан", "Іван", "Петро", "Андрій", "Микола", "Степан", "Василь", "Гриць"];
        const takenNames = currentPlayers.map(p => p.name);
        const availableNames = botNames.filter(name => !takenNames.includes(name));

        for (let i = 0; i < neededBots; i++) {
            const botId = `BOT-${uuidv4().substring(0, 5)}`;
            const name = availableNames[i] || `Повстанець ${i + 1}`;
            botUpdates[botId] = {
                userId: botId,
                name,
                role: 'civilian',
                alive: true,
                ready: true,
                message: '',
                knownEnemyId: null
            };
        }
        console.log('Adding bots:', botUpdates);
        try {
            await update(ref(database, `rooms/${roomId}/players`), botUpdates);
            console.log('Bots added successfully');
        } catch (error) {
            console.error('Error adding bots:', error);
        }
    };

    const setBotMessage = async (roomId: string, userId: string, message: string) => {
        await set(ref(database, `rooms/${roomId}/players/${userId}/message`), message);
    };

    const voteForBot = async (roomId: string, botId: string, candidateId: string) => {
        await set(ref(database, `rooms/${roomId}/votes/${botId}`), candidateId);
    };

    const setNkvdPlan = async (roomId: string, targets: string[]) => {
        const updates = {
            nkvdPlan: targets,
            phase: 'day_discussion',
            dayNumber: 1,
            speakerIndex: 0,
            wasNightKill: false,
            infoMessage: "Ранок настав. Починаємо обговорення."
        };
        await update(ref(database, `rooms/${roomId}`), updates);
    };

    return {
        room,
        myUserId,
        playerName,
        setPlayerName,
        createRoom,
        joinRoom,
        leaveRoom,
        listenToRoom,
        startGame,
        clearInfoMessage,
        nominatePlayer,
        voteForCandidate,
        sendNightAction,
        passTurn,
        finalizeVoting,
        addBots,
        setBotMessage,
        voteForBot,
        setNkvdPlan,
        appendDynamicPlan,
        endNight
    };
};
