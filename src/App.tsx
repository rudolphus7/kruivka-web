import { useState, useEffect, type CSSProperties } from 'react';
import Lobby from './components/Lobby';
import GameTable from './components/GameTable';
import { useGame } from './hooks/useGame';

// Переконайся, що шляхи до картинок правильні
import lobbyBg from './assets/bg-lobby.png';
import gameBg from './assets/bg-game.jpg';

function App() {
  const [screen, setScreen] = useState<'lobby' | 'table'>('lobby');
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const { room, listenToRoom } = useGame();

  useEffect(() => {
    if (currentRoomId) {
      const unsubscribe = listenToRoom(currentRoomId);
      return () => unsubscribe();
    }
  }, [currentRoomId, listenToRoom]);

  const handleEnterRoom = (roomId: string) => {
    setCurrentRoomId(roomId);
    setScreen('table');
  };

  const handleLeaveRoom = () => {
    setScreen('lobby');
    setCurrentRoomId(null);
  };

  const isTableScreen = screen === 'table';
  const currentBg = isTableScreen ? gameBg : lobbyBg;

  // Динамічні стилі для фону
  const backgroundStyle: CSSProperties = {
    backgroundImage: `url(${currentBg})`,
    // Змінили 50% -> 55%
    backgroundSize: isTableScreen ? '140% auto' : 'cover',
  };

  return (
    <div
      className="min-h-screen relative bg-black bg-center bg-no-repeat transition-all duration-700"
      style={backgroundStyle}
    >
      {/* ВИПРАВЛЕНО ТУТ: backdrop-blur-[2px] перенесено всередину className */}
      <div
        className={`absolute inset-0 transition-opacity duration-700 ${isTableScreen ? 'bg-black/80' : 'bg-black/60'} backdrop-blur-[2px]`}
      />

      <div className="relative z-10">
        {screen === 'lobby' && (
          <Lobby onEnterRoom={handleEnterRoom} />
        )}

        {screen === 'table' && room && (
          <GameTable room={room} onLeave={handleLeaveRoom} />
        )}

        {!room && screen === 'table' && (
          <div className="flex items-center justify-center h-screen">
            <p className="digital-text text-2xl">Підключення до системи...</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;