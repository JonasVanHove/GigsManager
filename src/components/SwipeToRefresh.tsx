'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useHapticFeedback } from '@/lib/use-mobile-features';

interface SwipeToRefreshProps {
  onRefresh: () => void | Promise<void>;
  children: React.ReactNode;
  disabled?: boolean;
  threshold?: number;
  maxDrag?: number;
}

export function SwipeToRefresh({
  onRefresh,
  children,
  disabled = false,
  threshold = 60,
  maxDrag = 120,
}: SwipeToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [startY, setStartY] = useState(0);
  const { feedback } = useHapticFeedback();

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing) return;

    const scrollTop = contentRef.current?.scrollTop ?? 0;
    if (scrollTop > 0) return;

    setStartY(e.touches[0].clientY);
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing) return;

    const scrollTop = contentRef.current?.scrollTop ?? 0;
    if (scrollTop > 0) return;

    const currentY = e.touches[0].clientY;
    const dragDelta = Math.max(0, currentY - startY);

    if (dragDelta > 0) {
      setIsDragging(true);
      const offset = Math.min(dragDelta, maxDrag);
      setDragOffset(offset);

      // Haptic feedback when crossing threshold
      if (dragDelta === threshold) {
        feedback('selection');
      }
    }
  }, [startY, disabled, isRefreshing, maxDrag, threshold, feedback]);

  const handleTouchEnd = useCallback(async () => {
    if (!isDragging || disabled || isRefreshing) return;

    setIsDragging(false);

    if (dragOffset >= threshold) {
      setIsRefreshing(true);
      feedback('success');

      try {
        await onRefresh();
      } catch (err) {
        console.error('Refresh failed:', err);
        feedback('error');
      } finally {
        setIsRefreshing(false);
        setDragOffset(0);
      }
    } else {
      setDragOffset(0);
    }
  }, [isDragging, dragOffset, disabled, isRefreshing, threshold, onRefresh, feedback]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart as EventListener);
    container.addEventListener('touchmove', handleTouchMove as EventListener, { passive: true });
    container.addEventListener('touchend', handleTouchEnd as EventListener);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart as EventListener);
      container.removeEventListener('touchmove', handleTouchMove as EventListener);
      container.removeEventListener('touchend', handleTouchEnd as EventListener);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const refresherOpacity = Math.min(dragOffset / threshold, 1);
  const rotationAngle = Math.min((dragOffset / threshold) * 360, 360);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{ touchAction: 'pan-x' }}
    >
      {/* Pull-to-refresh indicator */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 z-50 transition-opacity"
        style={{
          opacity: refresherOpacity,
          transform: `translateX(-50%) translateY(${Math.max(-50, dragOffset - 50)}px)`,
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-10 h-10 rounded-full bg-brand-500 text-white flex items-center justify-center shadow-lg transition-transform"
            style={{
              transform: `rotate(${isRefreshing ? 360 : rotationAngle}deg)`,
              animation: isRefreshing ? 'spin 1s linear infinite' : 'none',
            }}
          >
            {isRefreshing ? (
              <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
            {dragOffset >= threshold ? 'Release to refresh' : 'Pull to refresh'}
          </p>
        </div>
      </div>

      {/* Content with drag transform */}
      <div
        ref={contentRef}
        className="w-full h-full overflow-y-auto overflow-x-hidden"
        style={{
          transform: isDragging || isRefreshing ? `translateY(${dragOffset}px)` : 'translateY(0)',
          transition: isDragging ? 'none' : 'transform 0.3s ease-out',
        }}
      >
        {children}
      </div>

      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

// Quick action button with haptic feedback
interface HapticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  hapticType?: 'click' | 'success' | 'error' | 'warning' | 'selection';
  children: React.ReactNode;
}

export function HapticButton({
  hapticType = 'click',
  children,
  onClick,
  ...props
}: HapticButtonProps) {
  const { feedback } = useHapticFeedback();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      feedback(hapticType);
      onClick?.(e);
    },
    [hapticType, feedback, onClick]
  );

  return (
    <button {...props} onClick={handleClick}>
      {children}
    </button>
  );
}
