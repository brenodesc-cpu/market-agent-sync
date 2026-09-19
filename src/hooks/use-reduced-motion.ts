import { useEffect, useState } from "react";

/** SSR starts with motion disabled. Preference changes are applied live. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return reduced;
}
