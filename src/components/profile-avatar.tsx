"use client";

import { useEffect, useState, type ReactNode } from "react";

const photoEvent = "rent2go:profile-photo";
export function profilePhotoChanged(revision: string | null) {
  window.dispatchEvent(new CustomEvent(photoEvent, { detail: revision }));
}

export function ProfileAvatar({ fallback, initial }: { fallback: ReactNode; initial?: string | null }) {
  const [revision, setRevision] = useState(initial === undefined ? "current" : initial);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const changed = (event: Event) => {
      setRevision((event as CustomEvent<string | null>).detail);
      setFailed(null);
    };
    window.addEventListener(photoEvent, changed);
    return () => window.removeEventListener(photoEvent, changed);
  }, []);
  return <span className="avatar profile-avatar">
    {revision && failed !== revision
      ? <img key={revision} src={`/api/account/photo?v=${encodeURIComponent(revision)}`} alt="" onError={() => setFailed(revision)}/>
      : fallback}
  </span>;
}
