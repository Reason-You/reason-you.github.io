'use client';

import type { Ref } from 'react';

interface SkyGuidesProps {
  ref: Ref<HTMLCanvasElement>;
  visible: boolean;
}

export default function SkyGuides({ ref, visible }: SkyGuidesProps) {
  return (
    <canvas
      ref={ref}
      id="sky-guides"
      className="sky-guides pointer-events-none absolute inset-0 h-full w-full"
      hidden={!visible}
      role="img"
      aria-label="Right ascension and declination grid."
    />
  );
}
