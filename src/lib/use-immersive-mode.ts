// Hook for managing fullscreen mode on mobile devices
// Provides immersive/fullscreen mode toggle and status bar hiding

'use client';

import { useState, useEffect, useCallback } from 'react';

export function useImmersiveMode() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canRequestFullscreen, setCanRequestFullscreen] = useState(false);

  // Check if fullscreen API is available
  useEffect(() => {
    const isSupported = !!(
      document.fullscreenEnabled ||
      (document as any).webkitFullscreenEnabled ||
      (document as any).mozFullScreenEnabled ||
      (document as any).msFullscreenEnabled
    );

    setCanRequestFullscreen(isSupported);

    // Listen for fullscreen changes
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(isNowFullscreen);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Request fullscreen
  const requestFullscreen = useCallback(async () => {
    try {
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen();
      } else if ((elem as any).mozRequestFullScreen) {
        await (elem as any).mozRequestFullScreen();
      } else if ((elem as any).msRequestFullscreen) {
        await (elem as any).msRequestFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen request failed:', err);
    }
  }, []);

  // Exit fullscreen
  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if ((document as any).webkitFullscreenElement) {
        await (document as any).webkitExitFullscreen?.();
      } else if ((document as any).mozFullScreenElement) {
        await (document as any).mozCancelFullScreen?.();
      } else if ((document as any).msFullscreenElement) {
        await (document as any).msExitFullscreen?.();
      }
    } catch (err) {
      console.error('Exit fullscreen failed:', err);
    }
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen) {
      await exitFullscreen();
    } else {
      await requestFullscreen();
    }
  }, [isFullscreen, requestFullscreen, exitFullscreen]);

  // Hide status bar (Android Chrome)
  const hideStatusBar = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).chrome?.webstore) {
      // Android Chrome
      window.scrollTo(0, 1);
      document.documentElement.style.overflow = 'hidden';
    }
  }, []);

  return {
    isFullscreen,
    canRequestFullscreen,
    requestFullscreen,
    exitFullscreen,
    toggleFullscreen,
    hideStatusBar,
  };
}

// Hook for managing safe area insets (notch/camera island support)
export function useSafeAreaInsets() {
  const [insets, setInsets] = useState({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  useEffect(() => {
    const updateInsets = () => {
      const root = document.documentElement;
      const computedStyle = getComputedStyle(root);

      // Get CSS custom properties for safe area insets
      const getPixelValue = (value: string) => {
        const match = value.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      };

      setInsets({
        top: getPixelValue(computedStyle.getPropertyValue('--safe-area-inset-top')),
        right: getPixelValue(computedStyle.getPropertyValue('--safe-area-inset-right')),
        bottom: getPixelValue(computedStyle.getPropertyValue('--safe-area-inset-bottom')),
        left: getPixelValue(computedStyle.getPropertyValue('--safe-area-inset-left')),
      });
    };

    updateInsets();
    window.addEventListener('orientationchange', updateInsets);
    window.addEventListener('resize', updateInsets);

    return () => {
      window.removeEventListener('orientationchange', updateInsets);
      window.removeEventListener('resize', updateInsets);
    };
  }, []);

  return insets;
}
