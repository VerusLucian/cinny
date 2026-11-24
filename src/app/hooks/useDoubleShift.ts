import { useEffect, useRef } from 'react';

// Max time between the first Shift press and the release of the second one.
const DOUBLE_SHIFT_MS = 400;
// keyCode reported for key events handled by an IME
const IME_KEY_CODE = 229;

type ShiftTap = {
  /** `event.code` of the Shift key, so ShiftLeft followed by ShiftRight does not count. */
  code: string;
  firstDownAt: number;
  /** The first press was released and the second one is waiting for its release. */
  secondDown: boolean;
  firstUp: boolean;
};

/**
 * Calls `onDoubleShift` when the same Shift key (left or right) is pressed and released twice
 * within a short time without any other key, pointer press or focus change in between.
 * Held (repeating) keys, IME composition and Shift used as a modifier never trigger it.
 */
export const useDoubleShift = (onDoubleShift: () => void) => {
  const callbackRef = useRef(onDoubleShift);
  callbackRef.current = onDoubleShift;

  useEffect(() => {
    let tap: ShiftTap | undefined;
    const reset = () => {
      tap = undefined;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === IME_KEY_CODE) {
        reset();
        return;
      }
      if (event.key !== 'Shift') {
        reset();
        return;
      }
      if (event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) {
        reset();
        return;
      }

      const now = Date.now();
      if (
        tap?.code === event.code &&
        tap.firstUp &&
        !tap.secondDown &&
        now - tap.firstDownAt <= DOUBLE_SHIFT_MS
      ) {
        tap.secondDown = true;
        return;
      }
      tap = { code: event.code, firstDownAt: now, secondDown: false, firstUp: false };
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== 'Shift' || !tap || tap.code !== event.code) {
        reset();
        return;
      }
      if (!tap.secondDown) {
        tap.firstUp = true;
        return;
      }
      const withinTime = Date.now() - tap.firstDownAt <= DOUBLE_SHIFT_MS;
      reset();
      if (withinTime) callbackRef.current();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointerdown', reset);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointerdown', reset);
      window.removeEventListener('blur', reset);
    };
  }, []);
};
