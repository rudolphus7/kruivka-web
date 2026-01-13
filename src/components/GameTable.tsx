import React, { useState, useEffect, useMemo } from 'react';
import type { GameRoom, Player } from '../types/game';
import { useGame } from '../hooks/useGame';
import { useVoice } from '../hooks/useVoice';
import PlayerNode from './PlayerNode';
import { botSpeeches } from '../utils/botLogic';
import { Radio, Clock, Mic, MicOff, LogOut, Play } from 'lucide-react';
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
        <div className={`w-full h-screen overflow-hidden flex flex-col items-center justify-center p-4 transition-colors duration-200 ${showShotAnimation ? 'bg-red-900/50' : ''}`}>
            <div className="absolute w-[80vw] h-[80vw] max-w-[600px] max-h-[600px] border-4 border-white/5 rounded-full" />

            {playersList.map((p, i) => {
                const pos = POSITIONS[i] || { x: 50, y: 50 };
                const roleInfo = getRoleInfo(p);
                const globalIndex = allPlayersSorted.findIndex(pl => pl.userId === p.userId);
                const currentNkvdTargetId = (room.nkvdPlan && room.planIndex !== undefined) ? room.nkvdPlan[room.planIndex] : null;
                const isMeNKVD = myPlayer?.role === 'mafia' || myPlayer?.role === 'don';
                const isCurrentNkvdTarget = isMeNKVD && p.userId === currentNkvdTargetId;

                return (
                    <div
                        key={p.userId}
                        className="absolute transition-all duration-700"
                        style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
                    >
                        <PlayerNode
                            player={p}
                            isMe={p.userId === myUserId}
                            isSpeaking={room.phase === 'day_discussion' && globalIndex === room.speakerIndex}
                            isRouletteTarget={globalIndex === rouletteIndex}
                            isSelected={selectedForNomination === p.userId || candidatesList.includes(p.userId) || nkvdSelection.includes(p.userId) || selectedNightTarget === p.userId}
                            isNkvdTarget={isCurrentNkvdTarget}
                            votesReceived={voteCounts[p.userId] || 0}
                            roleColor={roleInfo.color}
                            roleName={roleInfo.name}
                            onClick={() => handlePlayerClick(p)}
                        />
                    </div>
                );
            })}
            {/* Dashboard / Status Header */}
            <div className="absolute top-8 left-0 right-0 flex flex-col items-center">
                <div className="flex gap-4 mb-2">
                    <div className="bg-black/80 px-4 py-1 border border-white/10 rounded-full flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 font-bold tracking-widest uppercase">КОД:</span>
                        <span className="text-[14px] text-amber-500 font-black font-mono tracking-[0.2em]">{room.roomId}</span>
                    </div>
                    <div className="bg-black/80 px-4 py-1 border border-white/10 rounded-full flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isMuted ? 'bg-red-500' : 'bg-green-500'} animate-pulse`} />
                        <span className="text-[10px] font-bold tracking-widest text-white uppercase">{statusText}</span>
                    </div>
                </div>

                {room.dayNumber > 0 && (
                    <div className="text-[8px] text-gray-500 tracking-[0.3em] font-bold mt-1">
                        ДЕНЬ {room.dayNumber}
                    </div>
                )}
            </div>

            <div className="glass-card w-48 h-32 flex flex-col items-center justify-center text-center p-2 z-10">
                <Radio className="text-[#c6ff00] mb-1" size={24} />
                <p className="digital-text text-sm font-bold uppercase">
                    {room.phase === 'day_discussion' ? `ЕФІР: ${currentSpeaker?.name}` : room.phase.replace('_', ' ')}
                </p>
                <div className="flex items-center gap-2 mt-2">
                    <Clock size={14} className="text-[#c6ff00]/70" />
                    <span className="text-[#c6ff00]/70 digital-text text-xs">ЧАС: {timeLeft}с</span>
                </div>
            </div>

            <div className="absolute bottom-8 w-full max-w-md px-6 flex flex-col gap-3">
                {room.status === 'lobby' && amIHost && (
                    <>
                        {playersList.length < 10 && (
                            <button
                                onClick={() => addBots(room.roomId, playersList)}
                                className="btn-tactical w-full flex items-center justify-center gap-2 bg-blue-600 mb-2"
                            >
                                ДОДАТИ БОТІВ ({10 - playersList.length})
                            </button>
                        )}
                        <button
                            onClick={() => startGame(room.roomId, playersList)}
                            disabled={playersList.length < 10}
                            className={`btn-tactical w-full flex items-center justify-center gap-2 ${playersList.length < 10 ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{ backgroundColor: '#388E3C' }}
                        >
                            <Play size={20} /> ПОЧАТИ ОПЕРАЦІЮ
                        </button>
                    </>
                )}

                {room.phase === 'night_zero' && myPlayer?.role === 'don' && (
                    <button
                        onClick={() => setNkvdPlan(room.roomId, nkvdSelection)}
                        disabled={nkvdSelection.length < 3}
                        className={`btn-tactical w-full bg-red-800 ${nkvdSelection.length < 3 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        ЗАТВЕРДИТИ ПЛАН ({nkvdSelection.length}/3)
                    </button>
                )}

                {room.phase === 'night' && (myPlayer?.role === 'mafia' || myPlayer?.role === 'don') && myPlayer?.alive && (
                    <div className="w-full space-y-2">
                        <button
                            onClick={() => {
                                if (canShootNow) {
                                    const currentTarget = room.nkvdPlan?.[room.planIndex];
                                    if (currentTarget) {
                                        handleShot(currentTarget); // Use handleShot for animation
                                        setSelectedNightTarget(currentTarget);
                                    }
                                }
                            }}
                            disabled={!canShootNow}
                            className={`btn-tactical w-full ${canShootNow ? 'bg-red-600 animate-pulse' : 'bg-gray-600 opacity-50 cursor-not-allowed'}`}
                        >
                            {canShootNow ? '🎯 ВИСТРІЛ ЗАРАЗ!' : '⏳ ЧЕКАЙТЕ РУЛЕТКУ...'}
                        </button>
                        {selectedNightTarget && (
                            <p className="text-xs text-green-500 text-center">✓ Вистріл підтверджено</p>
                        )}
                    </div>
                )}

                {room.phase === 'night' && myPlayer?.role === 'doctor' && myPlayer?.alive && (
                    <div className="w-full bg-black/60 p-3 rounded-lg border border-blue-500/30">
                        <div className="text-xs text-center text-blue-400 mb-1">💉 ЛІКАР</div>
                        <div className="text-xs text-center text-white">
                            Лікування: {selectedNightTarget ? '0/1 ✓' : '1/1'}
                        </div>
                        {selectedNightTarget && (
                            <p className="text-xs text-green-500 text-center mt-1">
                                Лікуєте: {room.players[selectedNightTarget]?.name}
                            </p>
                        )}
                        {room.lastHealedTarget && (
                            <p className="text-xs text-yellow-500 text-center mt-1">
                                ⚠️ Не можна: {room.players[room.lastHealedTarget]?.name}
                            </p>
                        )}
                    </div>
                )}

                {room.phase === 'night' && myPlayer?.role === 'sheriff' && myPlayer?.alive && (
                    <div className="w-full bg-black/60 p-3 rounded-lg border border-yellow-500/30">
                        <div className="text-xs text-center text-yellow-400 mb-1">🔍 ШЕРИФ</div>
                        <div className="text-xs text-center text-white">
                            Перевірка: {selectedNightTarget ? '0/1 ✓' : '1/1'}
                        </div>
                        {selectedNightTarget && (
                            <p className="text-xs text-green-500 text-center mt-1">
                                Перевіряєте: {room.players[selectedNightTarget]?.name}
                            </p>
                        )}
                        {sheriffResult && (
                            <div className={`mt-2 p-2 rounded text-center font-bold ${sheriffResult.isEnemy ? 'bg-red-900/80 text-red-200' : 'bg-green-900/80 text-green-200'}`}>
                                РЕЗУЛЬТАТ: {sheriffResult.isEnemy ? "ВОРОГ (НКВС)" : "СВІЙ (ГРОМАДЯНИН)"}
                            </div>
                        )}
                    </div>
                )}

                {isMyTurn && (
                    <>
                        {selectedForNomination && (
                            <button
                                onClick={() => {
                                    nominatePlayer(room.roomId, myUserId, selectedForNomination, room.nominations || {});
                                    setSelectedForNomination(null);
                                }}
                                className="btn-tactical w-full bg-red-600 mb-2"
                            >
                                ВИСУНУТИ {room.players[selectedForNomination].name}
                            </button>
                        )}
                        <button
                            onClick={() => passTurn(room.roomId, room.speakerIndex, allPlayersSorted, room.nominations || {}, room.wasNightKill, room.planIndex, room.nkvdPlan?.length || 0)}
                            className="btn-tactical w-full bg-[#ffa000]"
                        >
                            КІНЕЦЬ ЗВ'ЯЗКУ
                        </button>
                    </>
                )}

                <div className="flex justify-between items-center bg-black/40 backdrop-blur-md p-3 rounded-2xl">
                    <div className="flex items-center gap-3">
                        {isMuted ? <MicOff className="text-red-500" /> : <Mic className="text-green-500 animate-pulse" />}
                        <span className="text-[10px] font-bold tracking-widest">{isMuted ? "ЗВ'ЯЗОК ПЕРЕРВАНО" : "В ЕФІРІ"}</span>
                    </div>
                    <button
                        onClick={() => {
                            leaveRoom(room.roomId);
                            onLeave();
                        }}
                        className="text-gray-400 hover:text-white transition"
                        title="Вийти"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
            </div>

            {room.infoMessage && !room.winner && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm px-4 animate-in fade-in zoom-in duration-300 z-50">
                    <div className="bg-[#EFEBE9] border-2 border-black p-6 shadow-2xl relative">
                        <div className="absolute -top-4 left-4 bg-red-600 text-white px-3 py-1 text-[10px] font-black">ТЕРМІНОВО</div>
                        <h2 className="text-red-600 text-2xl font-black mb-4">ДОСЬЄ</h2>
                        <p className="text-black font-bold text-center border-t border-black pt-4">{room.infoMessage}</p>
                    </div>
                </div>
            )}

            {warningMessage && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[70] animate-in slide-in-from-top duration-300">
                    <div className="bg-red-600 text-white px-6 py-3 rounded-full shadow-lg border-2 border-white/20 font-bold text-sm flex items-center gap-2">
                        <span>⚠️ {warningMessage}</span>
                    </div>
                </div>
            )}

            {/* Game Over Modal */}
            {room.status === 'finished' && (
                <div className="absolute inset-0 bg-black/90 z-[60] flex flex-col items-center justify-center p-6 animate-in fade-in duration-1000">
                    <div className="max-w-md w-full text-center space-y-8">
                        <div className="space-y-2">
                            <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter uppercase glitch-text">
                                {room.winner === "UPA" ? "ПЕРЕМОГА УПА" : "ПЕРЕМОГА НКВС"}
                            </h1>
                            <p className="text-xl text-gray-400 font-mono tracking-widest">
                                {room.winner === "UPA" ? "ВОРОГІВ ЗНИЩЕНО" : "ПОВСТАННЯ ПРИДУШЕНО"}
                            </p>
                        </div>

                        <div className="p-6 border border-white/10 bg-white/5 rounded-2xl backdrop-blur-sm">
                            <PlayerNode
                                player={{
                                    userId: "WINNER",
                                    name: room.winner === "UPA" ? "СЛАВА УКРАЇНІ" : "РАДЯНСЬКА ВЛАДА",
                                    role: room.winner === "UPA" ? "civilian" : "don",
                                    alive: true,
                                    ready: true,
                                    message: "",
                                    knownEnemyId: null
                                }}
                                isMe={false}
                                isSpeaking={false}
                                isRouletteTarget={false}
                                isSelected={false}
                                isNkvdTarget={false}
                                votesReceived={0}
                                roleColor={room.winner === "UPA" ? "#43A047" : "#D32F2F"}
                                roleName={room.winner === "UPA" ? "ГЕРОЯМ СЛАВА" : "ОКУПАНТИ"}
                                onClick={() => { }}
                            />
                            <div className="mt-4 text-sm text-gray-500">
                                {room.infoMessage}
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 w-full max-w-xs mx-auto">
                            <button
                                onClick={() => {
                                    leaveRoom(room.roomId);
                                    onLeave();
                                }}
                                className="btn-tactical bg-gray-700 hover:bg-gray-600 w-full"
                            >
                                <LogOut className="inline mr-2" size={18} />
                                ГОЛОВНЕ МЕНЮ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GameTable;
