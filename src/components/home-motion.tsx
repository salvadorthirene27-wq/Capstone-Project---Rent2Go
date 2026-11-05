"use client";
import { useEffect } from "react";

export function HomeMotion() {
  useEffect(() => {
    if (!window.matchMedia || !window.IntersectionObserver) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;
    const active = new Set<Animation>();
    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target)) continue;
        seen.add(entry.target);
        observer.unobserve(entry.target);
        if (preference.matches) continue;
        try {
          const element = entry.target as HTMLElement;
          const animation = element.animate([
            { opacity: 0.4, transform: "translate3d(0, 16px, 0)" },
            { opacity: 1, transform: "translate3d(0, 0, 0)" },
          ], { duration: 560, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
          active.add(animation);
          void animation.finished.then(() => active.delete(animation), () => active.delete(animation));
        } catch { /* The default surface stays visible without animation support. */ }
      }
    }, { threshold: 0.12 });
    document.querySelectorAll(".marc-home [data-home-reveal]").forEach(element => observer.observe(element));
    const stop = () => {
      observer.disconnect();
      active.forEach(animation => animation.cancel());
      active.clear();
    };
    const change = () => { if (preference.matches) stop(); };
    preference.addEventListener("change", change);
    return () => { stop(); preference.removeEventListener("change", change); };
  }, []);
  return null;
}
