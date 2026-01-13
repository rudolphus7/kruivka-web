import React from 'react';
import type { Player } from '../types/game';
import { Skull, Crosshair } from 'lucide-react';

interface PlayerNodeProps {
    player: Player;
    isMe: boolean;
    isSpeaking: boolean;
    isRouletteTarget: boolean;
    // Specific statuses for cleaner logic
    isNominated: boolean;
    isSheriffChecked: boolean;
    isDoctorHealed: boolean;
    isMyTarget: boolean; // Selected by me for action
    isNkvdTarget: boolean; // Targeted by NKVD (for NKVD eyes only)
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
    // Determine frame color / highlight
    let frameClass = "border-gray-400"; // default photo border

    if (isSpeaking) frameClass = "border-yellow-400 shadow-[0_0_15px_rgba(255,215,0,0.6)]";
    else if (isMyTarget) frameClass = "border-green-500 scale-110 shadow-[0_0_10px_green]";
    else if (isRouletteTarget) frameClass = "border-red-600 animate-pulse";
    else if (player.alive) frameClass = "border-[#555]";

    return (
        <div className="flex flex-col items-center w-24 relative group z-10" onClick={onClick}>
            {/* ROULETTE / NKVD TARGET OVERLAY */}
            {isNkvdTarget && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-red-600 z-50 animate-ping opacity-75">
                    <Crosshair size={40} />
                </div>
            )}

            {/* CARD / POLAROID CONTAINER */}
            <div className={`kruivka-player-card relative transition-all duration-300 cursor-pointer ${!player.alive ? 'opacity-80 grayscale' : ''}`}>

                {/* PHOTO AREA */}
                <div className={`kruivka-player-photo w-14 h-14 bg-black overflow-hidden flex items-center justify-center relative border-2 ${frameClass}`}>

                    {/* Placeholder Avatar or Initials */}
                    <div className="text-white/80 font-mono text-xl font-bold bg-[#222] w-full h-full flex items-center justify-center">
                        {player.alive ? player.name.substring(0, 2).toUpperCase() : <Skull size={24} />}
                    </div>

                    {/* DEAD STAMP */}
                    {!player.alive && (
                        <div className="absolute inset-0 flex items-center justify-center rotate-[-15deg]">
                            <span className="k-stamp red border-2 text-[10px] bg-white/80 px-1">ЛІКВІДОВАНО</span>
                        </div>
                    )}
                </div>

                {/* NAME LABEL (Handwritten style) */}
                <div className="mt-1 text-center">
                    <p className="text-[10px] font-bold text-black font-mono leading-tight truncate w-14">
                        {player.name}
                    </p>
                    {isMe && <p className="text-[8px] text-gray-600">(ВИ)</p>}
                </div>

                {/* STATUS BADGES (Stamps on the paper) */}
                <div className="absolute -top-2 -right-4 flex flex-col gap-1 pointer-events-none">
                    {votesReceived > 0 && (
                        <div className="bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold shadow-md border border-white">
                            {votesReceived}
                        </div>
                    )}
                    {isNominated && (
                        <span className="k-stamp red text-[8px] rotate-6 bg-yellow-100">СУД!</span>
                    )}
                    {isSheriffChecked && (
                        <span className="k-stamp blue text-[8px] rotate-[-5deg] bg-white">ПЕРЕВІРЕНО</span>
                    )}
                    {isDoctorHealed && (
                        <span className="k-stamp blue text-[8px] rotate-3 bg-green-100">ЛІКУВАННЯ</span>
                    )}
                </div>
            </div>

            {/* ROLE LABEL (Top Secret Stamp style) */}
            {roleName && (
                <div className="mt-1 bg-black/80 px-2 py-0.5 rounded text-[8px] font-bold text-white shadow">
                    <span style={{ color: roleColor }}>{roleName}</span>
                </div>
            )}

            {/* MESSAGE BUBBLE (Typewritten note) */}
            {player.message && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-[#fff9c4] text-black p-2 shadow-lg border border-[#fbc02d] text-[9px] font-mono leading-tight min-w-[90px] rotate-1 z-50">
                    <div className="absolute bottom-[-4px] left-1/2 -translate-x-1/2 w-2 h-2 bg-[#fff9c4] border-b border-r border-[#fbc02d] rotate-45"></div>
                    "{player.message}"
                </div>
            )}
        </div>
    );
};

export default PlayerNode;
