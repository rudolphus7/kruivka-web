import React, { useState, useEffect, useMemo } from 'react';
import type { GameRoom, Player } from '../types/game';
import { useGame } from '../hooks/useGame';
import { useVoice } from '../hooks/useVoice';
import PlayerNode from './PlayerNode';
import { botSpeeches } from '../utils/botLogic';
import { Mic, MicOff, LogOut } from 'lucide-react';
import { ref, set } from 'firebase/database';
import { database } from '../firebase';

const POSITIONS = [
    { x: 50, y: 80 }, { x: 30, y: 72 }, { x: 15, y: 55 }, { x: 22, y: 38 },
    { x: 40, y: 25 }, { x: 60, y: 25 }, { x: 78, y: 32 }, { x: 86, y: 48 },
    { x: 82, y: 65 }, { x: 68, y: 78 }
];

interface GameTableProps {
    room: GameRoom;
    onLeave: () => void;
}

const GameTable: React.FC<GameTableProps> = ({ room, onLeave }) => {
    const { myUserId, passTurn, nominatePlayer, voteForCandidate, startGame, clearInfoMessage, addBots, sendNightAction, setBotMessage, finalizeVoting, voteForBot, setNkvdPlan, endNight, appendDynamicPlan, leaveRoom } = useGame();
    // --- ВСТАВИТИ ЦЕЙ БЛОК КОДУ ---

    // Автоматичне очищення повідомлень через 3 секунди
    useEffect(() => {
        if (room.infoMessage) {
            const timer = setTimeout(() => {
                // Викликаємо функцію очищення (вона зітре текст у базі Firebase)
                clearInfoMessage(room.roomId);
            }, 3000);

            // Якщо компонент зникне або повідомлення зміниться до 3с - скасовуємо таймер
            return () => clearTimeout(timer);
        }
    }, [room.infoMessage, room.roomId]);

    // -------------------------------
    const { isMuted, muteMic } = useVoice(room.roomId);

    const [selectedForNomination, setSelectedForNomination] = useState<string | null>(null);
    const [nkvdSelection, setNkvdSelection] = useState<string[]>([]);
    const [sheriffResult, setSheriffResult] = useState<{ name: string, isEnemy: boolean } | null>(null); // New state for Sheriff check result
    const [timeLeft, setTimeLeft] = useState(30);
    const [showShotAnimation, setShowShotAnimation] = useState(false);

    const playersList = useMemo(() => {
        const list = Object.values(room.players).sort((a, b) => a.userId.localeCompare(b.userId));
        const myIndex = list.findIndex(p => p.userId === myUserId);
        if (myIndex !== -1) {
            return [...list.slice(myIndex), ...list.slice(0, myIndex)];
        }
        return list;
    }, [room.players, myUserId]);

    const allPlayersSorted = useMemo(() => {
        return Object.values(room.players).sort((a, b) => a.userId.localeCompare(b.userId));
    }, [room.players]);

    const myPlayer = room.players[myUserId];
    const amIHost = room.hostId === myUserId;
    const currentSpeaker = allPlayersSorted[room.speakerIndex];
    const isMyTurn = room.phase === 'day_discussion' && currentSpeaker?.userId === myUserId;
    const candidatesList = useMemo(() => {
        return room.nominations ? Array.from(new Set(Object.values(room.nominations))) : [];
    }, [room.nominations]);

    // Timer & Auto-pass for Host
    useEffect(() => {
        setTimeLeft(30);
    }, [room.phase, room.speakerIndex]);

    useEffect(() => {
        if ((room.phase === 'day_discussion' || room.phase === 'night_planning') && timeLeft > 0) {
            const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
            return () => clearInterval(timer);
        }
    }, [room.phase, timeLeft]);

    // --- BOT AUTOMATION (HOST ONLY) ---
    useEffect(() => {
        if (!amIHost) return;

        // 1. Day Discussion Bot Logic
        if (room.phase === 'day_discussion') {
            if (timeLeft <= 0 || (currentSpeaker && !currentSpeaker.alive)) {
                passTurn(room.roomId, room.speakerIndex, allPlayersSorted, room.nominations || {}, room.wasNightKill, room.planIndex, room.nkvdPlan?.length || 0);
            } else if (currentSpeaker?.userId.startsWith('BOT') && currentSpeaker.alive) {
                if (timeLeft === 28) {
                    const isCandidate = candidatesList.includes(currentSpeaker.userId);
                    // Bot nominates only if it hasn't nominated yet AND there's a night kill
                    const hasNominated = room.nominations && room.nominations[currentSpeaker.userId];
                    const shouldNominate = !hasNominated && !isCandidate && room.wasNightKill && Math.random() < 0.4; // Increased prob slightly

                    if (shouldNominate) {
                        const potentialTargets = allPlayersSorted.filter(p => p.userId !== currentSpeaker.userId && p.alive && !candidatesList.includes(p.userId));
                        const target = potentialTargets.length > 0 ? potentialTargets[Math.floor(Math.random() * potentialTargets.length)] : null;

                        if (target) {
                            nominatePlayer(room.roomId, currentSpeaker.userId, target.userId, room.nominations || {});
                            setBotMessage(room.roomId, currentSpeaker.userId, botSpeeches.nomination(target.name));
                        }
                    } else {
                        const speech = isCandidate ? botSpeeches.defense() : botSpeeches.general(currentSpeaker.role);
                        setBotMessage(room.roomId, currentSpeaker.userId, speech);
                    }
                }
                if (timeLeft === 25) {
                    passTurn(room.roomId, room.speakerIndex, allPlayersSorted, room.nominations || {}, room.wasNightKill, room.planIndex, room.nkvdPlan?.length || 0);
                }
            }
        }

        // 2. Voting Bot Logic
        if (room.phase === 'day_voting') {
            const timer = setTimeout(() => {
                allPlayersSorted.forEach(p => {
                    if (p.userId.startsWith('BOT') && p.alive && candidatesList.length > 0) {
                        // Filter out self from voting candidates
                        const availableCandidates = candidatesList.filter(c => c !== p.userId);
                        // If only candidate is self, or no candidates (shouldn't happen), vote for first available or self if must
                        const choice = availableCandidates.length > 0
                            ? availableCandidates[Math.floor(Math.random() * availableCandidates.length)]
                            : candidatesList[0]; // Fallback, but logic shouldn't reach here if we want to avoid strict self-vote

                        // Strict rule: Bots never vote for themselves if possible. If only selection IS themselves, they might have to, but with >1 candidates it's avoidable.
                        if (choice) {
                            voteForBot(room.roomId, p.userId, choice);
                        }
                    }
                });
                setTimeout(() => {
                    finalizeVoting(room.roomId, allPlayersSorted, room.nominations || {}, room.planIndex, room.nkvdPlan?.length || 0);
                }, 3000);
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [timeLeft, amIHost, room.phase, room.roomId, room.speakerIndex, allPlayersSorted, candidatesList, room.nominations, room.wasNightKill, room.planIndex, room.nkvdPlan?.length, passTurn, currentSpeaker, nominatePlayer, setBotMessage, voteForBot, finalizeVoting]);

    const [rouletteIndex, setRouletteIndex] = useState(-1);
    const [selectedNightTarget, setSelectedNightTarget] = useState<string | null>(null);
    const [canShootNow, setCanShootNow] = useState(false);

    // Reset Sheriff result on phase change
    useEffect(() => {
        setSheriffResult(null);
        setSelectedNightTarget(null); // Also good to reset selection visual
    }, [room.phase]);

    // --- NIGHT & ROULETTE AUTOMATION (HOST ONLY) ---
    const [hasRunRoulette, setHasRunRoulette] = useState(false);

    useEffect(() => {
        if (!amIHost) return;
        if (room.phase !== 'night') {
            setHasRunRoulette(false);
            return;
        }

        if (room.phase === 'night' && !hasRunRoulette) {
            setHasRunRoulette(true);
            const runRoulette = async () => {
                const nkvdTargetId = room.nkvdPlan?.[room.planIndex];
                for (let i = 0; i < allPlayersSorted.length; i++) {
                    setRouletteIndex(i);
                    const p = allPlayersSorted[i];
                    if (p.userId === nkvdTargetId) {
                        // Bots shoot automatically
                        allPlayersSorted.forEach(async (bot) => {
                            if (bot.userId.startsWith('BOT') && bot.alive && (bot.role === 'mafia' || bot.role === 'don')) {
                                const botRef = ref(database, `rooms/${room.roomId}/nightActions/${bot.userId}`);
                                set(botRef, nkvdTargetId);
                            }
                        });
                    }
                    await new Promise(r => setTimeout(r, 1500));
                }
                setRouletteIndex(-1);
                await endNight(room.roomId, allPlayersSorted, room);
            };
            runRoulette();
        }
    }, [room.phase, room.roomId, amIHost, allPlayersSorted, room.nkvdPlan, room.planIndex, endNight, database]);

    // Track when NKVD can shoot (only when roulette is on target)
    useEffect(() => {
        const currentTarget = room.nkvdPlan?.[room.planIndex];
        if (room.phase === 'night' && rouletteIndex >= 0 && currentTarget) {
            const playerAtRoulette = allPlayersSorted[rouletteIndex];
            setCanShootNow(playerAtRoulette?.userId === currentTarget);
        } else {
            setCanShootNow(false);
        }
    }, [rouletteIndex, room.phase, room.nkvdPlan, room.planIndex, allPlayersSorted]);

    useEffect(() => {
        if (!amIHost) return;
        if (room.phase === 'night_planning') {
            if (timeLeft === 27) {
                const don = allPlayersSorted.find(p => p.role === 'don');
                const leader = (don && don.alive) ? don : allPlayersSorted.find(p => (p.role === 'mafia' || p.role === 'don') && p.alive);
                if (leader?.userId.startsWith('BOT')) {
                    const targets = allPlayersSorted.filter(p => !['mafia', 'don'].includes(p.role) && p.alive);
                    const victim = targets[Math.floor(Math.random() * targets.length)];
                    if (victim) {
                        appendDynamicPlan(room.roomId, victim.userId, room.nkvdPlan || []);
                    }
                }
            }
        }
    }, [room.phase, room.roomId, amIHost, allPlayersSorted, room.nkvdPlan, timeLeft, appendDynamicPlan]);

    useEffect(() => {
        if (isMyTurn) muteMic(false);
        else muteMic(true);
    }, [isMyTurn, muteMic]);

    useEffect(() => {
        if (room.infoMessage) {
            const timer = setTimeout(() => {
                if (amIHost) clearInfoMessage(room.roomId);
            }, 3000); // 3 seconds instead of 5
            return () => clearTimeout(timer);
        }
    }, [room.infoMessage, amIHost, room.roomId, clearInfoMessage]);

    const getRoleInfo = (player: Player) => {
        const isMe = player.userId === myUserId;
        const isMeNKVD = myPlayer?.role === 'mafia' || myPlayer?.role === 'don';
        const isTargetNKVD = player.role === 'mafia' || player.role === 'don';

        // 1. You always see your own role
        if (isMe) return getRoleDetails(player.role);

        // 2. Dead players' roles are visible to everyone (both open and closed modes)
        if (!player.alive) return getRoleDetails(player.role);

        // 3. NKVD (mafia + don = 3 people) see each other's roles while alive
        if (isMeNKVD && isTargetNKVD) return getRoleDetails(player.role);

        // 4. Everyone else sees NO ROLE for living players (empty)
        return { name: "", color: "#43A047" };
    };

    const getRoleDetails = (role: string) => {
        switch (role) {
            case 'don': return { name: "КОМАНДИР НКВС", color: "#D32F2F" };
            case 'mafia': return { name: "АГЕНТ НКВС", color: "#D32F2F" };
            case 'sheriff': return { name: "КОМАНДИР СБ", color: "#1976D2" };
            case 'doctor': return { name: "ЛІКАР", color: "#1976D2" };
            default: return { name: "УПІВЕЦЬ", color: "#43A047" };
        }
    };

    const voteCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        Object.values(room.votes || {}).forEach(v => {
            counts[v] = (counts[v] || 0) + 1;
        });
        return counts;
    }, [room.votes]);

    const handleShot = async (targetId: string) => {
        const target = room.players[targetId];
        if ((myPlayer?.role === 'mafia' || myPlayer?.role === 'don') && room.phase === 'night' && target?.alive) {
            await sendNightAction(room.roomId, targetId);
            setShowShotAnimation(true);
            setTimeout(() => setShowShotAnimation(false), 200);
        }
    };

    const [warningMessage, setWarningMessage] = useState<string | null>(null);

    useEffect(() => {
        if (warningMessage) {
            const timer = setTimeout(() => setWarningMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [warningMessage]);

    const handlePlayerClick = (p: Player) => {
        if (room.phase === 'night_zero' && myPlayer?.role === 'don' && p.userId !== myUserId) {
            if (nkvdSelection.includes(p.userId)) {
                setNkvdSelection(prev => prev.filter(id => id !== p.userId));
            } else if (nkvdSelection.length < 3) {
                setNkvdSelection(prev => [...prev, p.userId]);
            }
        }

        // Night Action Limits Check
        const hasActed = room.nightActions && room.nightActions[myUserId];

        // Doctor healing during night
        if (room.phase === 'night' && myPlayer?.role === 'doctor' && myPlayer?.alive && p.alive) {
            if (hasActed) {
                setWarningMessage("Ви вже лікували цієї ночі!");
                return;
            }
            if (p.userId === room.lastHealedTarget) {
                setWarningMessage("Не можна лікувати одного й того ж гравця двічі поспіль!");
                return;
            }
            setSelectedNightTarget(p.userId);
            sendNightAction(room.roomId, p.userId);
        }

        // Sheriff check during night
        if (room.phase === 'night' && myPlayer?.role === 'sheriff' && myPlayer?.alive && p.alive && p.userId !== myUserId) {
            if (hasActed || sheriffResult) {
                setWarningMessage("Ви вже перевіряли гравця цієї ночі!");
                return;
            }
            setSelectedNightTarget(p.userId);
            sendNightAction(room.roomId, p.userId);

            // Immediate feedback for Sheriff (Client-side check)
            const isEnemy = p.role === 'mafia' || p.role === 'don';
            setSheriffResult({ name: p.name, isEnemy });
        }

        if (isMyTurn && p.alive && p.userId !== myUserId) setSelectedForNomination(p.userId);
        if (room.phase === 'day_voting' && candidatesList.includes(p.userId) && myPlayer?.alive) voteForCandidate(room.roomId, p.userId);
    };

    const statusText = {
        'lobby': "ОЧІКУВАННЯ",
        'night_zero': "ПЛАНУВАННЯ",
        'night_planning': "ВИБІР ЦІЛІ",
        'day_discussion': "ЕФІР",
        'day_voting': "ГОЛОСУВАННЯ",
        'night': "НІЧ",
        'finished': "КІНЕЦЬ"
    }[room.phase] || room.phase.toUpperCase();

    return (
        <div className={`theme-kruivka w-full h-screen overflow-hidden flex flex-col items-center justify-center p-4 transition-colors duration-200 ${showShotAnimation ? 'bg-red-900/40' : ''}`}>
            {/* Dark overlay for mood */}
            <div className="absolute inset-0 bg-black/30 pointer-events-none" />

            {/* Players Table Area */}
            <div className="relative w-full h-full max-w-[800px] max-h-[600px] mx-auto mb-24">
                {/* Table texture or centerpiece could go here */}
                {playersList.map((p, i) => {
                    const pos = POSITIONS[i] || { x: 50, y: 50 };
                    const roleInfo = getRoleInfo(p);
                    const globalIndex = allPlayersSorted.findIndex(pl => pl.userId === p.userId);
                    const currentNkvdTargetId = (room.nkvdPlan && room.planIndex !== undefined) ? room.nkvdPlan[room.planIndex] : null;
                    const isMeNKVD = myPlayer?.role === 'mafia' || myPlayer?.role === 'don';
                    const isCurrentNkvdTarget = isMeNKVD && p.userId === currentNkvdTargetId;

                    // STATUS LOGIC
                    const isNominated = candidatesList.includes(p.userId);
                    const isSheriffChecked = myPlayer?.role === 'sheriff' && selectedNightTarget === p.userId; // Or previously checked? The UI currently shows *current* selection as "checked" for feedback.
                    const isDoctorHealed = myPlayer?.role === 'doctor' && selectedNightTarget === p.userId;
                    const isMyTarget = selectedNightTarget === p.userId || selectedForNomination === p.userId || nkvdSelection.includes(p.userId);

                    return (
                        <div
                            key={p.userId}
                            className={`absolute transition-all duration-700 ${p.message ? 'z-[100]' : 'z-auto'}`}
                            style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
                        >
                            <PlayerNode
                                player={p}
                                isMe={p.userId === myUserId}
                                isSpeaking={room.phase === 'day_discussion' && globalIndex === room.speakerIndex}
                                isRouletteTarget={globalIndex === rouletteIndex}

                                isNominated={isNominated}
                                isSheriffChecked={isSheriffChecked}
                                isDoctorHealed={isDoctorHealed}
                                isMyTarget={isMyTarget}
                                isNkvdTarget={isCurrentNkvdTarget}

                                votesReceived={voteCounts[p.userId] || 0}
                                roleName={roleInfo.name}
                                onClick={() => handlePlayerClick(p)}
                            />
                        </div>
                    );
                })}
            </div>

            {/* Top Status Bar (Paper Style) */}
            <div className="absolute top-4 left-0 right-0 flex justify-center z-20">
                <div className="bg-[#d7ccc8] border-2 border-[#5d4037] px-6 py-2 shadow-lg transform rotate-1 flex items-center gap-6">
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] text-[#5d4037] font-bold tracking-widest uppercase">КАМЕРА</span>
                        <span className="text-xl text-[#b71c1c] font-black font-mono">{room.roomId}</span>
                    </div>
                    <div className="h-8 w-[2px] bg-[#5d4037]/30" />
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] text-[#5d4037] font-bold tracking-widest uppercase">СТАТУС</span>
                        <span className="text-sm font-bold text-[#3e2723]">{statusText}</span>
                    </div>
                </div>
            </div>

            {/* INFO MESSAGE / DOSSIER */}
            {room.infoMessage && !room.winner && (
                <div className="absolute top-24 left-1/2 -translate-x-1/2 w-full max-w-sm px-4 animate-in fade-in zoom-in duration-300 z-30">
                    <div className="bg-[#fff9c4] border border-[#fbc02d] p-4 shadow-xl transform -rotate-1 relative">
                        <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-red-800 border-2 border-white flex items-center justify-center text-white font-bold text-xs shadow">!</div>
                        <p className="text-[#3e2723] font-mono text-sm font-bold text-center">{room.infoMessage}</p>
                    </div>
                </div>
            )}
            {/* WARNING TOAST */}
            {warningMessage && (
                <div className="absolute top-40 left-1/2 -translate-x-1/2 z-[70] animate-in slide-in-from-top duration-300">
                    <div className="bg-red-700 text-white px-6 py-2 shadow-lg border-2 border-white font-mono text-xs font-bold transform rotate-2">
                        ПОМИЛКА: {warningMessage}
                    </div>
                </div>
            )}

            {/* BOTTOM COMMAND DESK */}
            <div className="kruivka-panel absolute bottom-0 left-0 right-0 p-4 pb-8 z-40 flex flex-col gap-3 items-center">

                {/* TIMER CLOCK */}
                <div className="absolute -top-6 bg-[#3e2723] text-[#ffcd38] border-2 border-[#5d4037] rounded-full w-20 h-20 flex flex-col items-center justify-center shadow-lg">
                    <span className="text-[8px] opacity-70">ЧАС</span>
                    <span className="text-2xl font-mono font-bold">{timeLeft}</span>
                </div>

                {/* PHASE INDICATOR */}
                <div className="text-[#d7ccc8] text-xs font-mono tracking-widest mb-2 mt-4 uppercase">
                    {room.phase === 'day_discussion' ? `ЕФІР: ${currentSpeaker?.name}` : room.phase.replace('_', ' ')}
                </div>

                {/* CONTROLS ROW */}
                <div className="flex flex-wrap justify-center gap-3 w-full max-w-2xl">

                    {/* HOST CONTROLS */}
                    {room.status === 'lobby' && amIHost && (
                        <>
                            {playersList.length < 10 && (
                                <button onClick={() => addBots(room.roomId, playersList)} className="btn-kruivka">
                                    + БОТИ ({10 - playersList.length})
                                </button>
                            )}
                            <button onClick={() => startGame(room.roomId, playersList)} disabled={playersList.length < 10} className="btn-kruivka primary">
                                ПОЧАТИ ОПЕРАЦІЮ
                            </button>
                        </>
                    )}

                    {/* NIGHT ACTIONS */}
                    {room.phase === 'night_zero' && myPlayer?.role === 'don' && (
                        <button onClick={() => setNkvdPlan(room.roomId, nkvdSelection)} disabled={nkvdSelection.length < 3} className="btn-kruivka danger">
                            ЗАТВЕРДИТИ ПЛАН ({nkvdSelection.length}/3)
                        </button>
                    )}
                    {room.phase === 'night' && canShootNow && (
                        <button onClick={() => {
                            const target = room.nkvdPlan?.[room.planIndex];
                            if (target) { handleShot(target); setSelectedNightTarget(target); }
                        }} className="btn-kruivka danger animate-pulse">
                            ВОГОНЬ!
                        </button>
                    )}
                    {/* DAY ACTIONS */}
                    {isMyTurn && (
                        <>
                            {selectedForNomination && (
                                <button onClick={() => { nominatePlayer(room.roomId, myUserId, selectedForNomination, room.nominations || {}); setSelectedForNomination(null); }} className="btn-kruivka danger">
                                    СУДИТИ {room.players[selectedForNomination].name}
                                </button>
                            )}
                            <button onClick={() => passTurn(room.roomId, room.speakerIndex, allPlayersSorted, room.nominations || {}, room.wasNightKill, room.planIndex, room.nkvdPlan?.length || 0)} className="btn-kruivka primary">
                                ПЕРЕДАТИ СЛОВО
                            </button>
                        </>
                    )}

                    {/* FOOTER ACTIONS (Mic/Exit) */}
                    <div className="flex items-center gap-4 ml-4 pl-4 border-l border-[#8d6e63]">
                        <button onClick={() => { isMuted ? muteMic(false) : muteMic(true) }} className="text-[#d7ccc8] hover:text-white transition flex flex-col items-center">
                            {isMuted ? <MicOff size={20} className="text-red-400" /> : <Mic size={20} className="text-green-400" />}
                        </button>
                        <button onClick={() => { leaveRoom(room.roomId); onLeave(); }} className="text-[#d7ccc8] hover:text-white transition flex flex-col items-center" title="Вихід">
                            <LogOut size={20} />
                        </button>
                    </div>
                </div>

                {/* ROLE FEEDBACK PANEL (Sheriff/Doctor) */}
                {(sheriffResult || (room.phase === 'night' && myPlayer?.role === 'doctor' && selectedNightTarget)) && (
                    <div className="mt-2 bg-[#d7ccc8] text-[#3e2723] px-4 py-1 font-mono text-xs font-bold border border-[#5d4037] shadow-inner">
                        {sheriffResult && `РЕЗУЛЬТАТ: ${sheriffResult.isEnemy ? "ВОРОГ" : "СВІЙ"}`}
                        {myPlayer?.role === 'doctor' && selectedNightTarget && `ЛІКУВАННЯ: ${room.players[selectedNightTarget]?.name}`}
                    </div>
                )}
            </div>

            {/* Game Over Modal (Authentic) */}
            {room.status === 'finished' && (
                <div className="absolute inset-0 bg-[#3e2723]/95 z-[60] flex flex-col items-center justify-center p-6 animate-in fade-in duration-1000">
                    <div className="max-w-md w-full text-center space-y-8 border-4 border-[#d7ccc8] p-8 bg-[url('/src/assets/bg-kruivka-table.png')] bg-cover relative">
                        <div className="absolute inset-0 bg-black/60" /> {/* Dim bg image */}
                        <div className="relative z-10">
                            <h1 className="text-4xl font-black text-[#ffcd38] tracking-widest uppercase mb-2 drop-shadow-md">
                                {room.winner === "UPA" ? "ПЕРЕМОГА УПА" : "ПЕРЕМОГА НКВС"}
                            </h1>
                            <div className="w-full h-1 bg-[#d7ccc8] mb-6" />

                            <PlayerNode
                                player={{
                                    userId: "WINNER",
                                    name: room.winner === "UPA" ? "ГЕРОЇ" : "ЧЕКІСТИ",
                                    role: room.winner === "UPA" ? "civilian" : "don",
                                    alive: true,
                                    ready: true,
                                    message: "",
                                    knownEnemyId: null
                                }}
                                isMe={false}
                                isSpeaking={false}
                                isRouletteTarget={false}
                                isNominated={false}
                                isSheriffChecked={false}
                                isDoctorHealed={false}
                                isMyTarget={false}
                                isNkvdTarget={false}
                                votesReceived={0}
                                roleName={room.winner === "UPA" ? "УПА" : "НКВС"}
                                onClick={() => { }}
                            />

                            <button onClick={() => { leaveRoom(room.roomId); onLeave(); }} className="btn-kruivka primary w-full mt-8 text-lg">
                                ПОВЕРНУТИСЬ В ШТАБ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GameTable;
