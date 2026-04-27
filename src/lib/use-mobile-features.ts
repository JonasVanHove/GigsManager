// Hook for haptic feedback and vibration patterns
// Provides vibration API support across browsers

'use client';

import { useCallback } from 'react';

export interface VibrationPattern {
  short?: number;
  medium?: number;
  long?: number;
  double?: number[];
  triple?: number[];
  success?: number[];
  error?: number[];
  warning?: number[];
}

const VIBRATION_PATTERNS: VibrationPattern = {
  short: 10,
  medium: 25,
  long: 50,
  double: [25, 50, 25],
  triple: [20, 30, 20, 30, 20],
  success: [30, 50, 30],
  error: [50, 100, 50],
  warning: [20, 100, 20],
};

export function useHapticFeedback() {
  // Check if vibration API is available
  const isSupported = useCallback(() => {
    return typeof navigator !== 'undefined' && 'vibrate' in navigator;
  }, []);

  // Vibrate with a single duration
  const vibrate = useCallback((duration: number | number[]) => {
    if (isSupported()) {
      try {
        navigator.vibrate(duration);
      } catch (err) {
        console.debug('Vibration failed:', err);
      }
    }
  }, [isSupported]);

  // Pre-defined vibration patterns
  const vibratePattern = useCallback(
    (pattern: keyof VibrationPattern) => {
      const duration = VIBRATION_PATTERNS[pattern];
      if (duration) {
        vibrate(duration);
      }
    },
    [vibrate]
  );

  // Haptic feedback for different actions
  const feedback = useCallback(
    (type: 'click' | 'success' | 'error' | 'warning' | 'selection') => {
      if (!isSupported()) return;

      switch (type) {
        case 'click':
          vibrate(10);
          break;
        case 'success':
          vibratePattern('success');
          break;
        case 'error':
          vibratePattern('error');
          break;
        case 'warning':
          vibratePattern('warning');
          break;
        case 'selection':
          vibrate(5);
          break;
      }
    },
    [vibrate, vibratePattern, isSupported]
  );

  // Cancel vibration
  const cancel = useCallback(() => {
    if (isSupported()) {
      navigator.vibrate(0);
    }
  }, [isSupported]);

  return {
    isSupported: isSupported(),
    vibrate,
    vibratePattern,
    feedback,
    cancel,
  };
}

// Hook for managing screen orientation and lock
export function useScreenOrientation() {
  const isSupported = useCallback(() => {
    return typeof screen !== 'undefined' && 'orientation' in screen;
  }, []);

  const lock = useCallback(async (orientation: string) => {
    try {
      if ((screen as any).orientation?.lock) {
        await (screen as any).orientation.lock(orientation);
      }
    } catch (err) {
      console.debug('Orientation lock failed:', err);
    }
  }, []);

  const unlock = useCallback(() => {
    try {
      if ((screen as any).orientation?.unlock) {
        (screen as any).orientation.unlock();
      }
    } catch (err) {
      console.debug('Orientation unlock failed:', err);
    }
  }, []);

  const getCurrentOrientation = useCallback((): string | null => {
    return (screen as any).orientation?.type ?? null;
  }, []);

  return {
    isSupported: isSupported(),
    lock,
    unlock,
    getCurrentOrientation,
  };
}

// Hook for managing wake lock (keep screen on)
export function useWakeLock() {
  const isSupported = useCallback(() => {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      if ((navigator as any).wakeLock) {
        const wakeLock = await (navigator as any).wakeLock.request('screen');
        return wakeLock;
      }
    } catch (err) {
      console.debug('Wake lock request failed:', err);
      return null;
    }
  }, []);

  return {
    isSupported: isSupported(),
    requestWakeLock,
  };
}
