import React from 'react';
import type { Player } from '../types/game';
import { Skull, Crosshair } from 'lucide-react';
import cardBack from '../assets/sorochka.png';

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
    roleColor: string;
    roleName: string;
    onClick: () => void;
}

const PlayerNode: React.FC<PlayerNodeProps> = ({
    player, isMe, isSpeaking, isRouletteTarget,
    isNominated, isSheriffChecked, isDoctorHealed, isMyTarget, isNkvdTarget,
    votesReceived, roleColor, roleName, onClick
}) => {
    // LOGIC: Show Face if: It's ME OR The player is DEAD.
    // Show Back if: It's someone else AND they are ALIVE.
    const showFace = isMe || !player.alive;

    // Visual highlights for the card container
    let borderClass = "border-transparent";
    if (isSpeaking) borderClass = "ring-4 ring-yellow-400 shadow-[0_0_20px_rgba(255,215,0,0.6)]";
    else if (isMyTarget) borderClass = "ring-4 ring-green-500 scale-105 shadow-[0_0_15px_green]";
    else if (isRouletteTarget) borderClass = "ring-4 ring-red-600 animate-pulse";

    return (
        <div
            className="w-24 h-32 perspective-1000 relative group z-10 cursor-pointer"
            onClick={onClick}
        >
            {/* NKVD Target Overlay (Always on top of everything) */}
            {isNkvdTarget && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-600 z-[60] animate-ping opacity-75 pointer-events-none">
                    <Crosshair size={50} />
                </div>
            )}

            {/* FLIPPING CONTAINER */}
            <div className={`w-full h-full relative transition-transform duration-700 transform-style-3d ${!showFace ? 'rotate-y-180' : ''}`}>

                {/* --- FRONT FACE (ROLE / INFO) --- */}
                <div className={`absolute inset-0 w-full h-full backface-hidden bg-[#e0e0e0] border-2 border-gray-400 rounded-lg overflow-hidden flex flex-col ${borderClass}`}>
                    {/* Top Stripe (Role Color) */}
                    <div className="h-6 w-full flex items-center justify-center font-bold text-[10px] text-white shadow-sm" style={{ backgroundColor: roleColor || '#555' }}>
                        {roleName || "НЕВІДОМО"}
                    </div>

                    {/* Main Content (Avatar/Icon) */}
                    <div className="flex-1 flex items-center justify-center bg-[#f5f5f5] relative">
                        {player.alive ? (
                            <div className="text-4xl font-mono font-bold text-gray-700 opacity-20 select-none">
                                {player.name.substring(0, 2).toUpperCase()}
                            </div>
                        ) : (
                            <Skull size={40} className="text-gray-400" />
                        )}

                        {/* DEAD STAMP (On Face) */}
                        {!player.alive && (
                            <div className="absolute inset-0 flex items-center justify-center rotate-[-25deg]">
                                <span className="k-stamp red border-4 text-xs bg-white/50 px-2 py-1">ЛІКВІДОВАНО</span>
                            </div>
                        )}
                    </div>

                    {/* Bottom Name Label */}
                    <div className="bg-[#d7ccc8] py-1 text-center border-t border-gray-300">
                        <p className="text-[10px] font-black text-[#3e2723] truncate px-1 leading-tight">{player.name}</p>
                        {isMe && <p className="text-[8px] text-gray-600 leading-none">(ВИ)</p>}
                    </div>

                    {/* FRONT STATUS BADGES */}
                    <div className="absolute top-7 right-1 flex flex-col gap-1 items-end pointer-events-none">
                        {votesReceived > 0 && (
                            <div className="bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-md border-2 border-white">
                                {votesReceived}
                            </div>
                        )}
                        {isNominated && <span className="k-stamp red text-[8px] bg-yellow-100 shadow-sm">СУД!</span>}
                        {isSheriffChecked && <span className="k-stamp blue text-[8px] bg-white shadow-sm">ПЕРЕВІРЕНО</span>}
                        {isDoctorHealed && <span className="k-stamp blue text-[8px] bg-green-100 shadow-sm">ЛІКУВАННЯ</span>}
                    </div>
                </div>

                {/* --- BACK FACE (CARD SHIRT) --- */}
                <div className={`absolute inset-0 w-full h-full backface-hidden rotate-y-180 rounded-lg overflow-hidden border-2 border-[#3e2723] shadow-md ${borderClass}`}>
                    <img src={cardBack} alt="Card Back" className="w-full h-full object-cover" />

                    {/* Speaking Indicator on Back */}
                    {isSpeaking && (
                        <div className="absolute inset-0 border-4 border-yellow-400/50 animate-pulse rounded-lg pointer-events-none" />
                    )}

                    {/* Name Label on Back */}
                    <div className="absolute bottom-4 left-0 right-0 text-center">
                        <div className="bg-black/70 text-white text-[10px] font-bold py-0.5 px-2 inline-block rounded-md backdrop-blur-sm">
                            {player.name}
                        </div>
                    </div>
                </div>

            </div>

            {/* MESSAGE BUBBLE - OUTSIDE TRANSFORM CONTAINER */}
            {player.message && (
                <div className="absolute -top-16 left-1/2 -translate-x-1/2 z-[100] w-max max-w-[150px]">
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
