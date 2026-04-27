'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useImmersiveMode } from '@/lib/use-immersive-mode';
import { useHapticFeedback, useWakeLock } from '@/lib/use-mobile-features';

interface PerformanceModeProps {
  gigId: string;
  gigName: string;
  startTime?: Date;
  onClose: () => void;
}

export function PerformanceMode({ gigId, gigName, startTime, onClose }: PerformanceModeProps) {
  const [isActive, setIsActive] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [uiVisible, setUiVisible] = useState(true);
  const [wakeLock, setWakeLock] = useState<any>(null);
  const uiTimeoutRef = useRef<NodeJS.Timeout>();

  const { toggleFullscreen, requestFullscreen } = useImmersiveMode();
  const { feedback } = useHapticFeedback();
  const { requestWakeLock } = useWakeLock();

  // Initialize performance mode
  useEffect(() => {
    if (!isActive) return;

    // Request fullscreen
    requestFullscreen();
    feedback('success');

    // Request wake lock to keep screen on
    requestWakeLock().then((lock) => {
      if (lock) {
        setWakeLock(lock);
        feedback('click');
      }
    });

    // Auto-hide UI after 3 seconds
    const resetUiTimeout = () => {
      if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
      uiTimeoutRef.current = setTimeout(() => {
        setUiVisible(false);
      }, 3000);
    };

    resetUiTimeout();

    // Handle tap to show UI
    const handleTap = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        setUiVisible(true);
        resetUiTimeout();
      }
    };

    document.addEventListener('touchstart', handleTap);

    return () => {
      document.removeEventListener('touchstart', handleTap);
      if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
    };
  }, [isActive, requestFullscreen, requestWakeLock, feedback]);

  // Timer
  useEffect(() => {
    if (!isActive) return;

    const startTimeMs = startTime?.getTime() || Date.now();
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - startTimeMs);
    }, 100);

    return () => clearInterval(interval);
  }, [isActive, startTime]);

  // Format elapsed time
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  };

  const handleEndPerformance = useCallback(async () => {
    setIsActive(false);
    feedback('warning');

    // Release wake lock
    if (wakeLock) {
      try {
        await wakeLock.release();
        setWakeLock(null);
      } catch (err) {
        console.debug('Wake lock release failed:', err);
      }
    }

    // Exit fullscreen
    toggleFullscreen();

    onClose();
  }, [wakeLock, toggleFullscreen, feedback, onClose]);

  const handleMarker = useCallback(() => {
    feedback('success');
    // Could dispatch event to mark setlist position or note
  }, [feedback]);

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center z-[9999]">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-black to-slate-900" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full h-full p-6 safe-area-inset">
        {/* Gig Name */}
        <div className={`text-center transition-opacity duration-300 ${uiVisible ? 'opacity-100' : 'opacity-20'}`}>
          <h1 className="text-3xl sm:text-4xl font-bold text-brand-400 mb-2">{gigName}</h1>
          <p className="text-sm text-slate-400">Performance Mode</p>
        </div>

        {/* Timer */}
        <div
          className={`text-6xl sm:text-7xl font-mono font-bold text-transparent bg-gradient-to-r from-brand-400 via-brand-500 to-brand-600 bg-clip-text mt-12 transition-all duration-300 ${
            uiVisible ? 'scale-100 opacity-100' : 'scale-90 opacity-50'
          }`}
        >
          {formatTime(elapsedTime)}
        </div>

        {/* Control Buttons */}
        <div
          className={`flex gap-4 mt-auto transition-opacity duration-300 ${
            uiVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Marker Button */}
          <button
            onClick={handleMarker}
            className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-slate-800 text-slate-100 hover:bg-slate-700 active:bg-slate-600 transition border border-slate-700 hover:border-slate-600"
            title="Mark current position (haptic feedback)"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium">Marker</span>
          </button>

          {/* End Performance Button */}
          <button
            onClick={handleEndPerformance}
            className="flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-red-600 text-white hover:bg-red-700 active:bg-red-800 transition border border-red-500 hover:border-red-400"
            title="End performance and exit immersive mode"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-xs font-medium">End</span>
          </button>
        </div>

        {/* Minimal Status Info */}
        <div
          className={`absolute bottom-6 left-6 right-6 text-xs text-slate-500 transition-opacity duration-300 ${
            uiVisible ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <p>Tap screen to show controls • Long press to exit</p>
        </div>
      </div>

      {/* Keyboard shortcut: ESC to exit */}
      <div
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            handleEndPerformance();
          }
        }}
        className="absolute inset-0"
      />
    </div>
  );
}

// Button to enter performance mode
interface PerformanceModeButtonProps {
  gigId: string;
  gigName: string;
  startTime?: Date;
}

export function PerformanceModeButton({
  gigId,
  gigName,
  startTime,
}: PerformanceModeButtonProps) {
  const [isPerformanceMode, setIsPerformanceMode] = useState(false);
  const { feedback } = useHapticFeedback();

  const handleStartPerformance = useCallback(() => {
    feedback('success');
    setIsPerformanceMode(true);
  }, [feedback]);

  if (isPerformanceMode) {
    return (
      <PerformanceMode
        gigId={gigId}
        gigName={gigName}
        startTime={startTime}
        onClose={() => setIsPerformanceMode(false)}
      />
    );
  }

  return (
    <button
      onClick={handleStartPerformance}
      className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand-600 to-brand-700 text-white px-4 py-2 text-sm font-medium hover:from-brand-700 hover:to-brand-800 active:from-brand-800 active:to-brand-900 transition shadow-lg"
      title="Enter immersive performance mode with timer"
    >
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 9a3 3 0 0 1 3-3m0 0a3 3 0 0 1 3 3m-3-3v12m-3-9a3 3 0 0 0-3 3m0 0a3 3 0 0 0 3 3m-3-3v12m9-15a3 3 0 0 1 3-3m0 0a3 3 0 0 1 3 3m-3-3v12m-3-9a3 3 0 0 0-3 3m0 0a3 3 0 0 0 3 3m-3-3v12" />
      </svg>
      Performance Mode
    </button>
  );
}
