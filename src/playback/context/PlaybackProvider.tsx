import React, { ReactNode } from 'react';
import { usePlaybackManager } from '../hooks/usePlaybackManager';
import { PlaybackContext } from './PlaybackContext';
import { JellyfinPlayer } from '../components/JellyfinPlayer';
import { SyncPlayProvider } from '@/src/contexts/syncplay-context';

interface PlaybackProviderProps {
    children: ReactNode;
}

export const PlaybackProvider: React.FC<PlaybackProviderProps> = ({ children }) => {
    const manager = usePlaybackManager();
    const { playbackState } = manager;

    // We render the player globally here. 
    // It will be hidden unless there is an active item.
    // We pass the manager instance to it.
    
    // We need to determine if we should show the player overlay (fullscreen) or if it's just a bar?
    // The previous implementation of JellyfinPlayer included controls overlay.
    // For a main app integration, usually the video player takes over the screen or is a persistent bar.
    // Given the "magical cinema feel" requested, let's assume fullscreen overlay when playing video.

    const { isMiniPlayer } = playbackState;

    const mediaType = playbackState.currentItem?.MediaType as string | undefined;
    const isVideo = playbackState.currentItem 
        && (mediaType === 'Video' 
            || mediaType === 'Movie' 
            || mediaType === 'Episode' 
            || mediaType === 'TvChannel');

    const containerCalsses = isMiniPlayer
        ? `fixed bottom-24 right-6 w-96 aspect-video z-[100] shadow-2xl rounded-xl border border-white/10 overflow-hidden transition-all duration-500 ease-in-out ${isVideo ? 'opacity-100 pointer-events-auto translate-y-0 scale-100' : 'opacity-0 pointer-events-none translate-y-10 scale-95'}`
        : `fixed inset-0 z-[100] bg-black transition-opacity duration-500 ${isVideo ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`;

    return (
        <PlaybackContext.Provider value={manager}>
            <SyncPlayProvider>
                {children}

                <div className={containerCalsses}>
                    <JellyfinPlayer
                        manager={manager}
                        className="w-full h-full"
                    />
                </div>
            </SyncPlayProvider>
        </PlaybackContext.Provider>
    );
};
