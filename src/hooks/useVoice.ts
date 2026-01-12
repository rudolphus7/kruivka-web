import { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import type { IAgoraRTCClient, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

const APP_ID = "42c35c1acdf14fca8d0502a41108b044";

export const useVoice = (roomId: string) => {
    const client = useRef<IAgoraRTCClient | null>(null);
    const localTrack = useRef<IMicrophoneAudioTrack | null>(null);
    const [isMuted, setIsMuted] = useState(true);

    useEffect(() => {
        const initAgora = async () => {
            client.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

            // Add event listeners for remote users
            client.current.on("user-published", async (user, mediaType) => {
                await client.current!.subscribe(user, mediaType);
                if (mediaType === "audio") {
                    user.audioTrack?.play();
                }
            });

            client.current.on("user-unpublished", (user) => {
                if (user.audioTrack) {
                    user.audioTrack.stop();
                }
            });

            try {
                await client.current.join(APP_ID, roomId, null, null);
                localTrack.current = await AgoraRTC.createMicrophoneAudioTrack();
                await client.current.publish(localTrack.current);
                await localTrack.current.setEnabled(false); // Start muted
                setIsMuted(true);
            } catch (e) {
                console.error("Agora init failed", e);
            }
        };

        if (roomId) initAgora();

        return () => {
            localTrack.current?.stop();
            localTrack.current?.close();
            client.current?.leave();
        };
    }, [roomId]);

    const muteMic = async (mute: boolean) => {
        if (localTrack.current) {
            await localTrack.current.setEnabled(!mute);
            setIsMuted(mute);
        }
    };

    return { isMuted, muteMic };
};
