# Haptic Feedback & Vibration Patterns Guide

## Overview

Haptic feedback provides tactile responses to user interactions on mobile devices. This guide documents all haptic feedback patterns used in GigsManager and how to implement custom patterns.

## Pre-defined Patterns

### Short Vibration (10ms)
**Use case**: Standard button clicks, toggles
```typescript
const { feedback } = useHapticFeedback();
feedback('click');
```

### Medium Vibration (25ms)
**Use case**: Form validation, selection changes
```typescript
vibrate(25);
```

### Long Vibration (50ms)
**Use case**: Heavy operations, emphasis
```typescript
vibrate(50);
```

### Success Pattern (30-50-30ms)
**Use case**: Successful action confirmation, form submission
```typescript
vibratePattern('success');
// Pattern: 30ms vibrate, 50ms pause, 30ms vibrate
```

### Error Pattern (50-100-50ms)
**Use case**: Error messages, invalid input
```typescript
vibratePattern('error');
// Pattern: 50ms vibrate, 100ms pause, 50ms vibrate
```

### Warning Pattern (20-100-20ms)
**Use case**: Alerts, confirmations, cautions
```typescript
vibratePattern('warning');
// Pattern: 20ms vibrate, 100ms pause, 20ms vibrate
```

### Double Tap Pattern (25-50-25ms)
**Use case**: Double-tap detection, emphasis
```typescript
vibratePattern('double');
// Pattern: 25ms vibrate, 50ms pause, 25ms vibrate
```

### Triple Tap Pattern (20-30-20-30-20ms)
**Use case**: Multiple selections, emphasis sequences
```typescript
vibratePattern('triple');
// Pattern: 20ms, 30ms pause, 20ms, 30ms pause, 20ms
```

## Custom Patterns

Create custom vibration patterns using array format:

```typescript
const { vibrate } = useHapticFeedback();

// Single vibration
vibrate(50);

// Custom pattern: [vibration1, pause1, vibration2, pause2, ...]
vibrate([100, 200, 100]); // 100ms, pause 200ms, 100ms
vibrate([50, 100, 50, 100, 50]); // Complex pattern

// Long vibration with pause
vibrate([500]); // 500ms continuous
```

## Integration Examples

### Form Validation

```typescript
<input
  onBlur={async (e) => {
    const isValid = await validateEmail(e.target.value);
    if (isValid) {
      feedback('success');
    } else {
      feedback('error');
    }
  }}
/>
```

### Action Buttons

```typescript
<button 
  onClick={() => {
    feedback('success');
    performAction();
  }}
>
  Submit
</button>
```

### Haptic Button Component

```typescript
// For success actions
<HapticButton hapticType="success" onClick={handleDelete}>
  Delete Gig
</HapticButton>

// For standard clicks
<HapticButton hapticType="click" onClick={handleEdit}>
  Edit
</HapticButton>

// For warnings
<HapticButton hapticType="warning" onClick={handleConfirm}>
  Confirm Dangerous Action
</HapticButton>

// For errors
<HapticButton hapticType="error" onClick={handleRetry}>
  Retry
</HapticButton>
```

### Pull-to-Refresh with Haptic Feedback

```typescript
<SwipeToRefresh
  onRefresh={async () => {
    // haptic feedback is automatic:
    // - selection when crossing threshold
    // - success on refresh complete
    // - error if refresh fails
    await fetchGigs();
  }}
>
  <GigsList />
</SwipeToRefresh>
```

## Best Practices

### Do's ✅
- Use haptic feedback for confirmation of actions
- Provide feedback for successful completions
- Use different patterns for different action types
- Keep vibrations short (10-100ms)
- Combine with visual feedback for clarity
- Test on real devices with various haptic motors

### Don'ts ❌
- Don't use excessive haptic feedback (avoid annoyance)
- Don't use haptic feedback alone without visual feedback
- Don't create overly complex patterns
- Don't use haptic feedback for every single interaction
- Don't assume all devices support haptic feedback

## Performance Considerations

- Haptic feedback adds negligible performance overhead
- Vibration API is hardware-level, doesn't block UI
- Multiple rapid vibrations may drain battery slightly
- Most modern devices support at least basic haptics
- Fallback gracefully if API not available

## Browser Support Detection

```typescript
const { isSupported } = useHapticFeedback();

if (isSupported) {
  // Show haptic-enabled UI
  <button onClick={() => feedback('success')}>
    Haptic Enabled
  </button>
} else {
  // Show standard button without haptic
  <button onClick={handleClick}>
    Standard Button
  </button>
}
```

## Accessibility Considerations

### Screen Reader Integration
```typescript
<button 
  onClick={() => feedback('success')}
  aria-label="Submit form (haptic feedback enabled)"
>
  Submit
</button>
```

### Reducing Motion Preference
```typescript
import { useReducedMotion } from '@/lib/use-reduced-motion';

export function AccessibleButton() {
  const prefersReducedMotion = useReducedMotion();
  const { feedback } = useHapticFeedback();

  return (
    <button
      onClick={() => {
        if (!prefersReducedMotion) {
          feedback('click');
        }
        handleClick();
      }}
    >
      Accessible Click
    </button>
  );
}
```

## Debugging Haptic Feedback

### Test in Browser Console

```javascript
// Test haptic support
navigator.vibrate ? 'Haptic supported' : 'Not supported';

// Test basic vibration
navigator.vibrate(100);

// Test pattern
navigator.vibrate([50, 100, 50]);

// Cancel vibration
navigator.vibrate(0);
```

### Common Issues

**Issue**: Haptic feedback not working on iOS Safari
- **Solution**: Haptic feedback is limited on Safari (gesture-required), use alternative feedback

**Issue**: Haptic feedback drains battery too quickly
- **Solution**: Reduce frequency and duration of vibrations, use shorter patterns

**Issue**: Pattern not vibrating as expected
- **Solution**: Ensure array format is correct, test on device (emulator may not support)

## Real Device Testing

### Android Devices
1. **Vibration Settings**: Settings > Sound > Vibration > Enable
2. **Test App**: Open Settings > About > Spam Protection (has haptic test)
3. **Debug**: Open Chrome DevTools > Console, test navigator.vibrate()

### iOS Devices
1. **Haptic Settings**: Settings > Sounds & Haptics > Haptic Strength
2. **Limited Support**: Haptic is limited compared to Android
3. **Test**: Use Settings > Keyboard > Haptic Feedback

## References

- [MDN: Vibration API](https://developer.mozilla.org/en-US/docs/Web/API/Vibration_API)
- [W3C: Vibration Specification](https://www.w3.org/TR/vibration/)
- [Android: Haptic Guidelines](https://developer.android.com/design/basics/haptics-patterns)
- [Apple: Haptic Patterns](https://developer.apple.com/design/human-interface-guidelines/ios/user-interaction/haptics/)
