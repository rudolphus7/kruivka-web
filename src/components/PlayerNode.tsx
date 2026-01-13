import React from 'react';
import type { Player } from '../types/game';
import { Skull, Crosshair } from 'lucide-react';
import cardBack from '../assets/sorochka.png';
import nkvdImg from '../assets/nkvd.png';
import nkvdbossImg from '../assets/nkvdboss.png';
import sbImg from '../assets/sb.png';
import likarImg from '../assets/likar.png';
import upaImg from '../assets/upa.png';

interface PlayerNodeProps {
    player: Player;
    isMe: boolean;
    isSpeaking: boolean;
    isRouletteTarget: boolean;
    isNominated: boolean;
    isSheriffChecked: boolean;
    isDoctorHealed: boolean;
    isMyTarget: boolean;
    isNkvdTarget: boolean;
    votesReceived: number;
    roleName: string;
    gameMode?: "open" | "closed";
    onClick: () => void;
}

const PlayerNode: React.FC<PlayerNodeProps> = ({
    player, isMe, isSpeaking, isRouletteTarget,
    isNominated, isSheriffChecked, isDoctorHealed, isMyTarget, isNkvdTarget,
    votesReceived, roleName, gameMode = "open", onClick
}) => {
    // LOGIC: Show Face if: It's ME OR (The player is DEAD AND Game Mode is OPEN) OR (We explicitly know the role via roleName).
    // In Closed mode, dead players remain hidden (Back/Shirt).
    const showFace = isMe || (!player.alive && gameMode === 'open') || !!roleName;

    // Visual highlights - MOVED TO SEPARATE DIV
    // We construct the class string for the overlay, NOT the faces
    let highlightClass = "border-transparent";
    if (isSpeaking) highlightClass = "ring-4 ring-yellow-400 shadow-[0_0_20px_rgba(255,215,0,0.6)] z-30";
    else if (isMyTarget) highlightClass = "ring-4 ring-green-500 scale-105 shadow-[0_0_15px_green] z-30";
    else if (isRouletteTarget) highlightClass = "ring-4 ring-red-600 animate-pulse z-30";

    // Role Image Mapping
    const getRoleImage = (role?: string) => {
        const r = role?.toLowerCase();
        switch (r) {
            case 'mafia': return nkvdImg;
            case 'don': return nkvdbossImg;
            case 'sheriff': return sbImg;
            case 'doctor': return likarImg;
            case 'villager': return upaImg;
            default: return upaImg;
        }
    };

    const roleImage = getRoleImage(player.role);

    return (
        <div
            className="w-24 h-36 perspective-1000 relative group z-10 cursor-pointer"
            onClick={onClick}
        >
            {/* NKVD Target Overlay */}
            {isNkvdTarget && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-600 z-[60] animate-ping opacity-75 pointer-events-none">
                    <Crosshair size={50} />
                </div>
            )}

            {/* HIGHLIGHT OVERLAY - Separated from faces to prevent opacity conflicts */}
            {/* This div sits on top of the card and handles borders/pulse */}
            <div className={`absolute inset-0 rounded-lg pointer-events-none transition-all duration-300 ${highlightClass}`}></div>

            {/* FLIPPING CONTAINER */}
            <div
                className="w-full h-full relative transition-transform duration-700 transform-style-3d"
                style={{ transform: !showFace ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
            >

                {/* --- FRONT FACE (ROLE / INFO) --- */}
                {/* FAILSAFE: opacity-0 when flipped to prevent "seeing through" the card */}
                {/* Removed borderClass from here to avoid animate-pulse affecting opacity */}
                <div className={`absolute inset-0 w-full h-full backface-hidden bg-[#e0e0e0] border-2 border-gray-400 rounded-lg overflow-hidden flex flex-col transition-opacity duration-300 ${showFace ? 'opacity-100 delay-100' : 'opacity-0'}`}>

                    {/* Role Image Area */}
                    <div className="relative flex-1 bg-black min-h-0">
                        <img src={roleImage} alt={roleName} className="w-full h-full object-cover" />

                        {!player.alive && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                                <Skull size={40} className="text-white opacity-80" />
                                {/* Only show "Eliminated" stamp if face is visible (i.e. open game or me) */}
                                <div className="absolute inset-0 flex items-center justify-center rotate-[-25deg]">
                                    <span className="k-stamp red border-4 text-xs bg-white/50 px-2 py-1">ЛІКВІДОВАНО</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom Name Label */}
                    <div className="bg-[#d7ccc8] py-1.5 text-center border-t border-gray-500 shrink-0 flex items-center justify-center">
                        <p className="text-[11px] font-black text-[#3e2723] truncate px-1 leading-tight w-full">{player.name}</p>
                    </div>
                </div>

                {/* --- BACK FACE (CARD SHIRT) --- */}
                {/* Removed borderClass from here too */}
                <div className={`absolute inset-0 w-full h-full backface-hidden rounded-lg overflow-hidden border-2 border-[#3e2723] shadow-md bg-[#3e2723] transition-opacity duration-300 ${!showFace ? 'opacity-100' : 'opacity-0 delay-100'}`}
                    style={{ transform: 'rotateY(180deg)' }}>

                    <img src={cardBack} alt="Card Back" className="w-full h-full object-cover" />

                    {/* Speaking Indicator on Back (Inner Pulse if needed, but outer ring handles main pulse) */}

                    {/* Dead Indicator on Back (for Closed Game) */}
                    {!player.alive && gameMode === 'closed' && (
                        <div className="absolute inset-0 flex items-center justify-center z-20">
                            <Skull size={40} className="text-white/50" />
                        </div>
                    )}

                    {/* Name Label on Back */}
                    <div className="absolute bottom-4 left-0 right-0 text-center">
                        <div className="bg-black/70 text-white text-[10px] font-bold py-0.5 px-2 inline-block rounded-md backdrop-blur-sm">
                            {player.name}
                        </div>
                    </div>
                </div>

            </div>

            {/* STATUS BADGES (Front Side Logic) - Only visible when Face is visible */}
            <div className={`absolute top-2 right-[-8px] flex flex-col gap-1 items-end pointer-events-none z-[60] transition-opacity duration-300 ${!showFace ? 'opacity-0' : 'opacity-100'}`}>
                {votesReceived > 0 && (
                    <div className="bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-md border-2 border-white">
                        {votesReceived}
                    </div>
                )}
                {isNominated && <span className="k-stamp red text-[8px] bg-yellow-100 shadow-sm">СУД!</span>}
                {isSheriffChecked && <span className="k-stamp blue text-[8px] bg-white shadow-sm">ПЕРЕВІРЕНО</span>}
                {isDoctorHealed && <span className="k-stamp blue text-[8px] bg-green-100 shadow-sm">ЛІКУВАННЯ</span>}
            </div>

            {/* MESSAGE BUBBLE - Always Visible */}
            {player.message && (
                <div className="absolute -top-20 left-1/2 -translate-x-1/2 z-[100] w-max max-w-[150px]">
                    <div className="bg-[#fff9c4] text-black p-3 rounded-xl shadow-xl border-2 border-[#fbc02d] text-xs font-mono font-bold leading-tight relative animate-in zoom-in duration-200">
                        "{player.message}"
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#fff9c4] border-b-2 border-r-2 border-[#fbc02d] transform rotate-45"></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlayerNode;
