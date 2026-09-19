import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useReducedMotion } from "./use-reduced-motion";

/** Apply ref, className and style to a stable element. Delay is in milliseconds. */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(delay?: number) {
  const ref = useRef<T>(null);
  const revealed = useRef(false);
  const [isVisible, setIsVisible] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (reduced || typeof IntersectionObserver === "undefined") {
      element.classList.remove("nm-reveal-pending");
      setIsVisible(true);
      return;
    }
    if (revealed.current) return;
    let observer: IntersectionObserver | undefined;
    const reveal = () => {
      revealed.current = true;
      element.classList.remove("nm-reveal-pending");
      setIsVisible(true);
      observer?.disconnect();
    };
    try {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) reveal();
        },
        { rootMargin: "0px 0px -32px 0px", threshold: 0 },
      );
      observer.observe(element);
      // Never hide focused content or content already passed on a restored scroll position.
      if (element.contains(document.activeElement) || element.getBoundingClientRect().bottom <= 0) {
        reveal();
      } else {
        element.classList.add("nm-reveal-pending");
        setIsVisible(false);
      }
    } catch {
      reveal();
    }
    element.addEventListener("focusin", reveal);
    return () => {
      observer?.disconnect();
      element.removeEventListener("focusin", reveal);
      element.classList.remove("nm-reveal-pending");
    };
  }, [reduced]);

  return {
    ref,
    isVisible,
    className: "nm-reveal",
    style: (delay === undefined
      ? {}
      : { "--nm-reveal-delay": `${Math.min(600, Math.max(0, delay))}ms` }) as CSSProperties,
  };
}
