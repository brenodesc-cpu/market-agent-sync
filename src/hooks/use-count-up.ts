import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./use-reduced-motion";

/** Undefined means no data: the caller renders a skeleton only while its request is pending.
 * SSR and reduced motion return the real value. This is presentation, never progress.
 */
export function useCountUp(value: number | null | undefined, duration = 700, enabled = true) {
  const target = typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const reduced = useReducedMotion();
  const previous = useRef<number | undefined>(undefined);
  const [frame, setFrame] = useState({ target, value: target });

  useEffect(() => {
    if (target === undefined) {
      previous.current = undefined;
      return;
    }
    if (reduced || !enabled) return;
    if (duration <= 0) {
      previous.current = target;
      setFrame({ target, value: target });
      return;
    }
    const start = previous.current ?? 0;
    let started: number | undefined;
    let request = 0;
    const tick = (time: number) => {
      started ??= time;
      const progress = Math.min(1, (time - started) / duration);
      const current = start + (target - start) * (1 - (1 - progress) ** 3);
      previous.current = current;
      setFrame({ target, value: current });
      if (progress < 1) request = window.requestAnimationFrame(tick);
    };
    request = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(request);
  }, [target, reduced, duration, enabled]);

  return reduced || !enabled || frame.target !== target ? target : frame.value;
}
