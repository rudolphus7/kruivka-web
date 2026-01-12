import React, { useState } from 'react';
import { useGame } from '../hooks/useGame';
import { User, Lock, ShieldCheck, Zap, Sword } from 'lucide-react';

interface LobbyProps {
    onEnterRoom: (roomId: string) => void;
}

const Lobby: React.FC<LobbyProps> = ({ onEnterRoom }) => {
    const { playerName, createRoom, joinRoom } = useGame();
    const [tempName, setTempName] = useState(playerName);
    const [roomCode, setRoomCode] = useState("");
    const [selectedMode, setSelectedMode] = useState<'open' | 'closed'>('closed');
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleCreate = async () => {
        if (!tempName.trim()) { setError("Введіть позивний"); return; }
        setLoading(true);
        try {
            const id = await createRoom(tempName, selectedMode);
            onEnterRoom(id);
        } catch (e: any) { setError(e.message); }
        setLoading(false);
    };

    const handleJoin = async () => {
        if (!tempName.trim()) { setError("Введіть позивний"); return; }
        if (!roomCode.trim()) { setError("Введіть код"); return; }
        setLoading(true);
        try {
            await joinRoom(roomCode, tempName);
            onEnterRoom(roomCode);
        } catch (e: any) { setError(e.message); }
        setLoading(false);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
            <div className="glass-card max-w-md w-full text-center">
                <h1 className="text-2xl font-black tracking-widest text-white mb-2">СИСТЕМА "КРИЇВКА"</h1>
                <p className="text-xs text-gray-400 tracking-wider mb-6">АВТОРИЗАЦІЯ КОРИСТУВАЧА</p>

                <div className="inline-block border border-red-600 bg-red-600/10 px-4 py-1 mb-8">
                    <p className="text-[10px] text-red-500 font-black tracking-widest flex items-center gap-2">
                        <ShieldCheck size={12} /> РІВЕНЬ ДОСТУПУ: ТАЄМНО
                    </p>
                </div>

                {error && <p className="text-red-500 text-xs mb-4">{error}</p>}

                <div className="relative mb-6 text-left">
                    <label className="text-[10px] text-gray-400 absolute left-3 -top-2 bg-[#1e1e1e] px-1">ВАШ ПОЗИВНИЙ</label>
                    <div className="flex items-center input-tactical">
                        <User size={18} className="text-gray-400 mr-2" />
                        <input
                            value={tempName}
                            onChange={(e) => setTempName(e.target.value.toUpperCase())}
                            className="bg-transparent border-none outline-none text-white w-full"
                            placeholder="ПОЗИВНИЙ"
                        />
                    </div>
                </div>

                <div className="mb-8 text-left">
                    <p className="text-[10px] text-gray-400 mb-2">РЕЖИМ ОПЕРАЦІЇ</p>
                    <div className="flex gap-1 bg-black/50 p-1 rounded-xl">
                        <button
                            onClick={() => setSelectedMode('closed')}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${selectedMode === 'closed' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
                        >
                            ЗАКРИТА
                        </button>
                        <button
                            onClick={() => setSelectedMode('open')}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${selectedMode === 'open' ? 'bg-white/10 text-white' : 'text-gray-500'}`}
                        >
                            ВІДКРИТА
                        </button>
                    </div>
                </div>

                <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="btn-tactical w-full flex items-center justify-center gap-2 mb-6"
                >
                    <Zap size={18} /> СТВОРИТИ КРИЇВКУ
                </button>

                <div className="flex items-center gap-4 mb-6">
                    <div className="h-[1px] bg-white/10 flex-1"></div>
                    <span className="text-[10px] text-gray-500">АБО</span>
                    <div className="h-[1px] bg-white/10 flex-1"></div>
                </div>

                <div className="relative mb-4 text-left">
                    <label className="text-[10px] text-gray-400 absolute left-3 -top-2 bg-[#1e1e1e] px-1">КОД ДОСТУПУ</label>
                    <div className="flex items-center input-tactical">
                        <Lock size={18} className="text-gray-400 mr-2" />
                        <input
                            value={roomCode}
                            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                            className="bg-transparent border-none outline-none text-white w-full"
                            placeholder="КОД"
                        />
                    </div>
                </div>

                <button
                    onClick={handleJoin}
                    disabled={loading}
                    className="btn-tactical btn-amber w-full flex items-center justify-center gap-2"
                >
                    <Sword size={18} /> ДОЛУЧИТИСЬ
                </button>
            </div>
        </div>
    );
};

export default Lobby;
