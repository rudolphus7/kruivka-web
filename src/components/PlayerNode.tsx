import React from 'react';
import type { Player } from '../types/game';
import { Skull, Target } from 'lucide-react';

interface PlayerNodeProps {
    player: Player;
    isMe: boolean;
    isSpeaking: boolean;
    isRouletteTarget: boolean;
    isSelected: boolean;
    isNkvdTarget: boolean;
    votesReceived: number;
    roleColor: string;
    roleName: string;
    onClick: () => void;
}

const PlayerNode: React.FC<PlayerNodeProps> = ({
    player, isMe, isSpeaking, isRouletteTarget, isSelected, isNkvdTarget,
    votesReceived, roleColor, roleName, onClick
}) => {
    const statusColor = isRouletteTarget ? 'var(--lamp-red)' : isSpeaking ? 'var(--lamp-on)' : isSelected ? 'var(--lamp-yellow)' : 'transparent';

    return (
        <div className="flex flex-col items-center w-20 relative">
            <div
                onClick={onClick}
                className={`w-12 h-12 rounded-full border-2 cursor-pointer transition-all duration-300 flex items-center justify-center
          ${isNkvdTarget ? 'border-red-600 animate-pulse' : 'border-white/20'}
          ${player.alive ? '' : 'grayscale opacity-50'}
        `}
                style={{
                    backgroundColor: statusColor !== 'transparent' ? statusColor + '44' : '',
                    boxShadow: statusColor !== 'transparent' ? `0 0 15px ${statusColor}` : ''
                }}
            >
                {!player.alive && <Skull size={20} className="text-gray-400" />}
                {player.alive && isNkvdTarget && <Target size={20} className="text-red-500" />}

                {votesReceived > 0 && (
                    <div className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        {votesReceived}
                    </div>
                )}
            </div>

            <div className="mt-2 text-center">
                <div className="bg-black/60 px-2 py-0.5 rounded-md">
                    <p className={`text-[9px] font-bold truncate tracking-tighter ${isSpeaking ? 'text-[#00e676]' : 'text-white'}`}>
                        {player.name.toUpperCase()} {isMe && "(ВИ)"}
                    </p>
                </div>

                {roleName && (
                    <p className="text-[7px] font-black mt-1" style={{ color: roleColor }}>{roleName}</p>
                )}
            </div>

            {player.message && (
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-white text-black p-2 rounded-lg text-[8px] leading-tight min-w-[80px] shadow-lg">
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-white"></div>
                    {player.message}
                </div>
            )}
        </div>
    );
};

export default PlayerNode;
