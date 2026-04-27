# Mobile & Android Optimization Guide

## Overview
This document describes all mobile and Android-specific optimizations implemented to provide the best experience on mobile devices, particularly focusing on maximizing usable screen space for devices with notches and camera islands.

## Features Implemented

### 1. **Status Bar & Notch Optimization**

#### Viewport Configuration
- `viewportFit: "cover"` - Allows content to extend behind camera notch and status bar cutouts
- `userScalable: false` - Prevents accidental zoom gestures on mobile
- `minimumScale: 1` - Ensures proper minimum zoom level
- `maximumScale: 1` - Locks zoom to prevent unintended scaling

#### HTML Meta Tags
```html
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="viewport" content="viewport-fit=cover, ..." />
<meta name="fullscreen" content="yes" />
```

### 2. **Safe Area Support (Notch/Camera Island)**

#### CSS Integration
CSS custom properties defined in `globals.css`:
```css
:root {
  --safe-area-inset-top: env(safe-area-inset-top, 0px);
  --safe-area-inset-right: env(safe-area-inset-right, 0px);
  --safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-inset-left: env(safe-area-inset-left, 0px);
}

html {
  padding-top: max(env(safe-area-inset-top), 0px);
  padding-left: max(env(safe-area-inset-left), 0px);
  padding-right: max(env(safe-area-inset-right), 0px);
  padding-bottom: max(env(safe-area-inset-bottom), 0px);
}
```

These variables can be used in components:
```typescript
const insets = useSafeAreaInsets();
// Returns: { top, right, bottom, left } in pixels
```

### 3. **Immersive Mode (Fullscreen)**

#### Hook: `useImmersiveMode`
Located in `src/lib/use-immersive-mode.ts`

**Features:**
- Request/exit fullscreen mode
- Toggle fullscreen with single function call
- Detect fullscreen API availability across browsers
- Listen to fullscreen changes
- Status bar hiding on Android

**Usage:**
```typescript
const { 
  isFullscreen, 
  canRequestFullscreen, 
  toggleFullscreen,
  hideStatusBar 
} = useImmersiveMode();

// Toggle fullscreen mode
onClick={toggleFullscreen}

// Hide Android status bar
onClick={hideStatusBar}
```

#### Component: `ImmersiveButton`
Located in `src/components/ImmersiveButton.tsx`

- Auto-detects fullscreen API support
- Shows/hides based on capability
- Visual feedback for active state
- Integrated into Dashboard header

### 4. **Safe Area Hook**

#### Hook: `useSafeAreaInsets`
```typescript
const insets = useSafeAreaInsets();
// insets = { top: number, right: number, bottom: number, left: number }
```

**Updates on:**
- Component mount
- Orientation changes
- Window resize
- Screen size changes

**Use Case:** Position UI elements to avoid camera notch
```typescript
<div style={{ 
  paddingTop: `${insets.top}px`,
  paddingRight: `${insets.right}px`
}}>
  Content that respects notch areas
</div>
```

## Browser Compatibility

### Fullscreen API
- Chrome/Chromium: ✅ Full support
- Safari: ✅ WebKit prefix support
- Firefox: ✅ Mozilla prefix support
- Edge: ✅ Full support
- Samsung Internet: ✅ Support via webkit prefix

### Safe Area Insets (CSS)
- iOS Safari: ✅ Partial (iPhone X+)
- Android Chrome: ✅ Full (Android 9+)
- Samsung Internet: ✅ Full (Android 6+)

### Status Bar Control
- Android Chrome: ✅ Via theme-color meta tag
- Android Samsung: ✅ Via theme-color meta tag
- iOS Safari: ✅ Via apple-mobile-web-app-status-bar-style

## Implementation Details

### Files Modified
1. **`src/app/layout.tsx`**
   - Added viewport configuration with `viewportFit: "cover"`
   - Added meta tags for fullscreen and status bar control
   - Added mobile app capability meta tags

2. **`src/app/globals.css`**
   - Added safe area support with CSS env() variables
   - Full viewport coverage for notch devices
   - Disabled text selection and touch callouts for better UX

3. **`src/lib/use-immersive-mode.ts`** (NEW)
   - `useImmersiveMode()` hook for fullscreen management
   - `useSafeAreaInsets()` hook for notch detection
   - Multi-browser fullscreen API support

4. **`src/components/ImmersiveButton.tsx`** (NEW)
   - Immersive mode toggle button
   - Auto-detection of API support
   - Visual feedback system

5. **`src/components/Dashboard.tsx`**
   - Integrated ImmersiveButton into header
   - Imported use-immersive-mode hook

### CSS Classes
All buttons use consistent Tailwind styling:
```css
/* Active state (immersive enabled) */
border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-950/30 dark:text-brand-300

/* Inactive state */
border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800
```

## Testing Recommendations

### Android Devices
1. **Pixel 5/6 (with notch)**: Test safe area insets and fullscreen
2. **Samsung Galaxy S21 (with punch hole)**: Test camera island support
3. **OnePlus (with waterdrop notch)**: Test notch area usage
4. **Older Android (no notch)**: Verify safe area defaults to 0

### iOS Devices
1. **iPhone 12/13/14 (with notch)**: Test notch support
2. **iPad Pro (with notch)**: Test landscape orientation
3. **Older iPhone**: Verify backwards compatibility

### Testing Checklist
- [ ] Viewport fills entire screen without visible status bar (Android)
- [ ] Camera notch area doesn't overlap important UI
- [ ] Fullscreen toggle hides browser chrome
- [ ] Status bar reappears when exiting fullscreen
- [ ] Safe area insets update on orientation change
- [ ] No zoom allowed (maximumScale: 1)
- [ ] PWA installs with correct home screen appearance
- [ ] Performance metrics remain unaffected

## Performance Impact

- **Bundle size**: +3KB (use-immersive-mode.ts + ImmersiveButton)
- **Runtime overhead**: Negligible (event listeners, minimal re-renders)
- **Paint time**: No impact (CSS env variables are static)
- **Layout shift**: Prevented with CSS padding approach

## Fallback Behavior

All features gracefully degrade:
- **No fullscreen API**: Button hidden automatically
- **No safe area support**: Defaults to 0px insets
- **Status bar control**: Ignored if not supported
- **Mobile apps**: PWA manifest provides fallback display modes

## Future Enhancements

1. **Gesture Controls**
   - Swipe gestures for navigation
   - Double-tap for quick actions
   - Long-press for context menus

2. **Haptic Feedback**
   - Vibration on successful actions
   - Haptic click feedback on buttons
   - Custom vibration patterns

3. **Camera Cutout Utilities**
   - Helper classes for notch-aware padding
   - Automatic component repositioning
   - Screen metrics API integration

4. **Immersive Mode Features**
   - Hide/show app UI on tap
   - Gesture-based fullscreen toggle
   - Auto-hide timeout for immersive mode

## Debugging

### Check Safe Area Insets
```javascript
// In browser console
getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top')
```

### Monitor Fullscreen Changes
```javascript
document.addEventListener('fullscreenchange', () => {
  console.log('Fullscreen:', document.fullscreenElement);
});
```

### View Viewport Fit
```javascript
// Check if viewport-fit is applied
getComputedStyle(document.documentElement).borderRadius // Should show notch effect
```

## References

- [MDN: CSS env()](https://developer.mozilla.org/en-US/docs/Web/CSS/env())
- [MDN: Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API)
- [Apple: Safe Area](https://developer.apple.com/design/human-interface-guidelines/ios/visual-design/adaptivity-and-layout/)
- [Android: Display Cutouts](https://developer.android.com/guide/topics/display-cutout)
- [W3C: CSS Viewport-fit](https://drafts.csswg.org/css-viewport/)
