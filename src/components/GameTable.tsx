import React, { useState, useEffect, useMemo } from 'react';
import type { GameRoom, Player } from '../types/game';
import { useGame } from '../hooks/useGame';
import { useVoice } from '../hooks/useVoice';
import PlayerNode from './PlayerNode';
import { botSpeeches } from '../utils/botLogic';
import { Mic, MicOff, LogOut } from 'lucide-react';
import { ref, set } from 'firebase/database';
import { database } from '../firebase';
import { useWindowSize } from '../hooks/useWindowSize';

// Desktop: Wide Oval
const DESKTOP_POSITIONS = [
    { x: 50, y: 85 }, { x: 25, y: 75 }, { x: 10, y: 50 }, { x: 25, y: 25 },
    { x: 40, y: 15 }, { x: 60, y: 15 }, { x: 75, y: 25 }, { x: 90, y: 50 },
    { x: 75, y: 75 }, { x: 60, y: 85 }
];

// Mobile: Scaled Oval (Compressed to Safe Zone)
// "Me" is lifted to 72% to clear the footer area completely
const MOBILE_POSITIONS = [
    { x: 50, y: 72 }, // 1 (Me)
    { x: 20, y: 64 }, // 2
    { x: 8, y: 45 }, // 3
    { x: 12, y: 25 }, // 4
    { x: 35, y: 12 }, // 5
    { x: 50, y: 10 }, // 6 (Top)
    { x: 65, y: 12 }, // 7
    { x: 88, y: 25 }, // 8
    { x: 92, y: 45 }, // 9
    { x: 80, y: 64 }  // 10
];

interface GameTableProps {
    room: GameRoom;
    onLeave: () => void;
}

const GameTable: React.FC<GameTableProps> = ({ room, onLeave }) => {
    const { myUserId, passTurn, nominatePlayer, voteForCandidate, startGame, clearInfoMessage, addBots, sendNightAction, setBotMessage, finalizeVoting, voteForBot, endNight, appendDynamicPlan, leaveRoom } = useGame();

    const { isMuted, muteMic } = useVoice(room.roomId);
    const { width } = useWindowSize();
    const isMobile = width < 768;

    // Position Logic
    const positions = isMobile ? MOBILE_POSITIONS : DESKTOP_POSITIONS;

    const [selectedForNomination, setSelectedForNomination] = useState<string | null>(null);
    const [nkvdSelection, setNkvdSelection] = useState<string[]>([]);
    const [sheriffResult, setSheriffResult] = useState<{ name: string, isEnemy: boolean } | null>(null);
    const [timeLeft, setTimeLeft] = useState(30);
    const [showShotAnimation, setShowShotAnimation] = useState(false);
    const [warningMessage, setWarningMessage] = useState<string | null>(null);
    const [showInfoToast, setShowInfoToast] = useState(false);
    const lastMessageRef = React.useRef<string | null>(null);

    // ... (rest of hooks)

    // FIXED: Only show toast when message CHANGES
    useEffect(() => {
        if (room.infoMessage && room.infoMessage !== lastMessageRef.current) {
            lastMessageRef.current = room.infoMessage;
            setShowInfoToast(true);
            const timer = setTimeout(() => {
                setShowInfoToast(false);
                // We keep lastMessageRef set so it doesn't pop up again until it changes to something NEW
            }, 3000);
            return () => clearTimeout(timer);
        } else if (!room.infoMessage) {
            // If message is cleared on server, we can reset our ref to allow re-broadcast of same message if needed later?
            // Or just leave it. better to reset if null.
            lastMessageRef.current = null;
            setShowInfoToast(false);
        }
    }, [room.infoMessage]);

    // ...

    {/* INFO MESSAGE - Minimalist Capsule */ }
    {
        showInfoToast && !room.winner && room.infoMessage && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="bg-black/60 backdrop-blur-md border border-[#8d6e63] px-6 py-2 rounded-full shadow-2xl flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[#d7ccc8] font-mono text-xs font-bold tracking-wider uppercase text-center whitespace-nowrap">
                        {room.infoMessage}
                    </span>
                </div>
            </div>
        )
    }
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

    // --- TIMER ---
    useEffect(() => {
        setTimeLeft(30);
    }, [room.phase, room.speakerIndex]);

    useEffect(() => {
        if ((room.phase === 'day_discussion' || room.phase === 'night_planning') && timeLeft > 0) {
            const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
            return () => clearInterval(timer);
        }
    }, [room.phase, timeLeft]);

    // --- BOTS & AUTO-PASS ---
    useEffect(() => {
        if (!amIHost) return;

        // Day Discussion
        if (room.phase === 'day_discussion') {
            if (timeLeft <= 0 || (currentSpeaker && !currentSpeaker.alive)) {
                passTurn(room.roomId, room.speakerIndex, allPlayersSorted, room.nominations || {}, room.wasNightKill, room.planIndex, room.nkvdPlan?.length || 0);
            } else if (currentSpeaker?.userId.startsWith('BOT') && currentSpeaker.alive) {
                if (timeLeft === 28) {
                    const isCandidate = candidatesList.includes(currentSpeaker.userId);
                    const hasNominated = room.nominations && room.nominations[currentSpeaker.userId];
                    const shouldNominate = !hasNominated && !isCandidate && room.wasNightKill && Math.random() < 0.4;

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

        // Voting
        if (room.phase === 'day_voting') {
            const timer = setTimeout(() => {
                allPlayersSorted.forEach(p => {
                    if (p.userId.startsWith('BOT') && p.alive && candidatesList.length > 0) {
                        const availableCandidates = candidatesList.filter(c => c !== p.userId);
                        const choice = availableCandidates.length > 0
                            ? availableCandidates[Math.floor(Math.random() * availableCandidates.length)]
                            : candidatesList[0];
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

    // --- NIGHT LOGIC ---
    const [rouletteIndex, setRouletteIndex] = useState(-1);
    const [selectedNightTarget, setSelectedNightTarget] = useState<string | null>(null);
    const [canShootNow, setCanShootNow] = useState(false);
    const [hasRunRoulette, setHasRunRoulette] = useState(false);

    useEffect(() => {
        setSheriffResult(null);
        setSelectedNightTarget(null);
    }, [room.phase]);

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

    // BUG FIX: Ensure ONLY NKVD (Mafia/Don) can shoot
    useEffect(() => {
        const currentTarget = room.nkvdPlan?.[room.planIndex];
        const isNKVD = myPlayer?.role === 'mafia' || myPlayer?.role === 'don';

        if (room.phase === 'night' && rouletteIndex >= 0 && currentTarget && isNKVD) {
            const playerAtRoulette = allPlayersSorted[rouletteIndex];
            // Only enable shoot button if roulette is ON the target
            setCanShootNow(playerAtRoulette?.userId === currentTarget);
        } else {
            setCanShootNow(false);
        }
    }, [rouletteIndex, room.phase, room.nkvdPlan, room.planIndex, allPlayersSorted, myPlayer?.role]);

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

    // --- MIC & INFO ---
    useEffect(() => {
        if (isMyTurn) muteMic(false);
        else muteMic(true);
    }, [isMyTurn, muteMic]);

    // FIXED: Local state for immediate info message handling (3s)
    useEffect(() => {
        if (room.infoMessage) {
            setShowInfoToast(true);
            const timer = setTimeout(() => {
                setShowInfoToast(false);
                clearInfoMessage(room.roomId);
            }, 3000);
            return () => clearTimeout(timer);
        } else {
            setShowInfoToast(false);
        }
    }, [room.infoMessage, room.roomId, clearInfoMessage]);

    // --- WARNING TOAST ---
    useEffect(() => {
        if (warningMessage) {
            const timer = setTimeout(() => setWarningMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [warningMessage]);

    // --- HELPERS ---
    const getRoleInfo = (player: Player) => {
        const isMe = player.userId === myUserId;
        const isMeNKVD = myPlayer?.role === 'mafia' || myPlayer?.role === 'don';
        const isTargetNKVD = player.role === 'mafia' || player.role === 'don';

        if (isMe) return getRoleDetails(player.role);

        // BUG FIX: Hide dead players' roles DURING NIGHT
        const isNight = room.phase === 'night' || room.phase === 'night_zero' || room.phase === 'night_planning';
        if (!player.alive) {
            if (isNight && room.gameMode === 'open') {
                return { name: "", color: "#43A047" }; // Hide
            }
            return getRoleDetails(player.role);
        }
        if (isMeNKVD && isTargetNKVD) return getRoleDetails(player.role);
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

    const handlePlayerClick = (p: Player) => {
        if (room.phase === 'night_zero' && myPlayer?.role === 'don' && p.userId !== myUserId) {
            if (nkvdSelection.includes(p.userId)) {
                setNkvdSelection(prev => prev.filter(id => id !== p.userId));
            } else if (nkvdSelection.length < 3) {
                setNkvdSelection(prev => [...prev, p.userId]);
            }
        }

        const hasActed = room.nightActions && room.nightActions[myUserId];

        if (room.phase === 'night' && myPlayer?.role === 'doctor' && myPlayer?.alive && p.alive) {
            if (hasActed) { setWarningMessage("Ви вже лікували цієї ночі!"); return; }
            if (p.userId === room.lastHealedTarget) { setWarningMessage("Не можна лікувати одного й того ж гравця двічі поспіль!"); return; }
            setSelectedNightTarget(p.userId);
            sendNightAction(room.roomId, p.userId);
        }

        if (room.phase === 'night' && myPlayer?.role === 'sheriff' && myPlayer?.alive && p.alive && p.userId !== myUserId) {
            if (hasActed || sheriffResult) { setWarningMessage("Ви вже перевіряли гравця цієї ночі!"); return; }
            setSelectedNightTarget(p.userId);
            sendNightAction(room.roomId, p.userId);
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

    // --- RENDER ---
    // Key Change: h-[100dvh] for mobile browsers
    return (
        <div className={`theme-kruivka w-full h-[100dvh] overflow-hidden flex flex-col items-center justify-center p-0 transition-colors duration-200 ${showShotAnimation ? 'bg-red-900/40' : ''}`}>

            <div className="absolute inset-0 bg-black/40 pointer-events-none" />

            {/* CENTRAL TIMER */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none flex flex-col items-center justify-center">
                <div className="w-24 h-24 rounded-full border-4 border-[#5d4037] bg-[#212121] shadow-[0_0_30px_rgba(0,0,0,0.8)] flex flex-col items-center justify-center relative">
                    <div className="absolute inset-0 rounded-full border border-[#ffffff10]"></div>
                    <span className="text-[10px] text-[#8d6e63] font-bold tracking-widest mb-1">ЧАС</span>
                    <span className={`text-4xl font-mono font-black tracking-wider ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-[#ffcd38]'}`}>
                        {timeLeft}
                    </span>
                </div>
            </div>

            {/* TABLE AREA */}
            <div className="relative w-full h-full max-w-[1000px] max-h-[800px] mx-auto">
                {playersList.map((p, i) => {
                    const pos = positions[i] || { x: 50, y: 50 };
                    const roleInfo = getRoleInfo(p);
                    const globalIndex = allPlayersSorted.findIndex(pl => pl.userId === p.userId);
                    const currentNkvdTargetId = (room.nkvdPlan && room.planIndex !== undefined) ? room.nkvdPlan[room.planIndex] : null;
                    const isMeNKVD = myPlayer?.role === 'mafia' || myPlayer?.role === 'don';
                    const isCurrentNkvdTarget = isMeNKVD && p.userId === currentNkvdTargetId;

                    const isNominated = candidatesList.includes(p.userId);
                    const isSheriffChecked = myPlayer?.role === 'sheriff' && selectedNightTarget === p.userId;
                    const isDoctorHealed = myPlayer?.role === 'doctor' && selectedNightTarget === p.userId;
                    const isMyTarget = selectedNightTarget === p.userId || selectedForNomination === p.userId || nkvdSelection.includes(p.userId);

                    return (
                        <div
                            key={p.userId}
                            className={`absolute transition-all duration-700 ${p.message ? 'z-[100]' : 'z-auto'} ${isMobile ? 'scale-75 origin-center' : ''}`}
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
                                gameMode={room.gameMode || 'open'}
                                onClick={() => handlePlayerClick(p)}
                            />
                        </div>
                    );
                })}
            </div>

            {/* TOP BAR - ONLY IN LOBBY */}
            {room.phase === 'lobby' && (
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
            )}

            {/* INFO MESSAGE - MOVED HIGHER AND AUTO-HIDES */}
            {showInfoToast && !room.winner && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 w-full max-w-sm px-4 animate-in fade-in zoom-in duration-300 z-50 pointer-events-none">
                    <div className="bg-[#fff9c4]/90 backdrop-blur-sm border border-[#fbc02d] p-4 shadow-xl transform -rotate-1 relative rounded-lg">
                        <div className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-red-800 border-2 border-white flex items-center justify-center text-white font-bold text-xs shadow">!</div>
                        <p className="text-[#3e2723] font-mono text-sm font-bold text-center">{room.infoMessage}</p>
                    </div>
                </div>
            )}

            {/* WARNING TOAST */}
            {warningMessage && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] bg-red-700 text-white px-6 py-3 rounded-lg shadow-2xl animate-bounce font-bold border-2 border-red-900">
                    {warningMessage}
                </div>
            )}

            {/* WINNER SCREEN */}
            {room.winner && (
                <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center animate-in zoom-in duration-500">
                    <h1 className="text-6xl font-black text-white mb-4 drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">
                        {room.winner === 'mafia' ? "ПЕРЕМОГА НКВС (МАФІЯ)" : "ПЕРЕМОГА УПА (МИРНІ)"}
                    </h1>
                    <button onClick={() => { leaveRoom(room.roomId); onLeave(); }} className="mt-8 px-8 py-3 bg-[#5d4037] text-white font-bold rounded hover:bg-[#4e342e] transition">
                        ВИЙТИ В МЕНЮ
                    </button>
                </div>
            )}

            {/* FOOTER PANEL - FIXED BOTTOM & HIGH Z-INDEX */}
            <div className="kruivka-panel fixed bottom-0 left-0 right-0 p-3 min-h-[80px] z-[200] flex items-center justify-between gap-2 shadow-[0_-10px_40px_rgba(0,0,0,0.9)] pb-safe">

                <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[#8d6e63] text-[9px] font-bold tracking-widest uppercase">ОПЕРАЦІЯ</span>
                    <span className="text-[#d7ccc8] text-xs font-mono font-bold truncate">
                        {room.phase === 'day_discussion' ? `${currentSpeaker?.name} ГОВОРИТЬ` : room.phase.replace('_', ' ').toUpperCase()}
                    </span>
                </div>

                <div className="flex-shrink-0 flex gap-2">
                    {room.status === 'lobby' && amIHost && (
                        <>
                            {playersList.length < 10 && (
                                <button onClick={() => addBots(room.roomId, playersList)} className="btn-kruivka text-xs px-2">
                                    +БОТ
                                </button>
                            )}
                            <button onClick={() => startGame(room.roomId, playersList)} className="btn-kruivka primary text-sm px-6">
                                ПОЧАТИ
                            </button>
                        </>
                    )}

                    {room.phase === 'night' && (myPlayer?.role === 'mafia' || myPlayer?.role === 'don') && (
                        <button
                            disabled={!canShootNow}
                            onClick={() => {
                                const target = room.nkvdPlan?.[room.planIndex];
                                if (target && canShootNow) { handleShot(target); setSelectedNightTarget(target); }
                            }}
                            className={`btn-kruivka danger text-sm px-6 transition-all duration-100 ${canShootNow ? 'animate-pulse scale-110 opacity-100' : 'opacity-50 grayscale'}`}
                        >
                            ЛІКВІДУВАТИ
                        </button>
                    )}

                    {isMyTurn && (
                        <>
                            {selectedForNomination && (
                                <button onClick={() => { nominatePlayer(room.roomId, myUserId, selectedForNomination, room.nominations || {}); setSelectedForNomination(null); }} className="btn-kruivka danger text-xs px-3">
                                    СУД: {room.players[selectedForNomination].name}
                                </button>
                            )}
                            <button onClick={() => passTurn(room.roomId, room.speakerIndex, allPlayersSorted, room.nominations || {}, room.wasNightKill, room.planIndex, room.nkvdPlan?.length || 0)} className="btn-kruivka primary text-sm px-6">
                                ЗАВЕРШИТИ
                            </button>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-3 pl-3 border-l border-[#5d4037]/50">
                    <button onClick={() => { isMuted ? muteMic(false) : muteMic(true) }} className="w-10 h-10 rounded-full bg-[#2d1e1b] border border-[#5d4037] flex items-center justify-center text-[#d7ccc8] hover:bg-[#3e2723] transition">
                        {isMuted ? <MicOff size={18} className="text-red-400" /> : <Mic size={18} className="text-green-400" />}
                    </button>
                    <button onClick={() => { leaveRoom(room.roomId); onLeave(); }} className="w-10 h-10 rounded-full bg-[#2d1e1b] border border-[#5d4037] flex items-center justify-center text-[#d7ccc8] hover:bg-[#3e2723] transition">
                        <LogOut size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GameTable;
