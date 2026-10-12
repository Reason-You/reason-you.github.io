/** Shared with the existing background canvas; its appearance stays unchanged. */
export const BACKGROUND_METEOR = {
  dark: { color: [222, 240, 255], opacity: 0.26 },
  light: { color: [154, 174, 196], opacity: 0.14 },
  midAlpha: 0.36,
  tipAlpha: 0.86,
  headAlpha: 0.75,
  referenceWidth: 1.6,
} as const;

/** Split luminous stroke energy between the white core, warm plume and halo. */
export function meteorPhotometry(gain: number, fireball: boolean, dark: boolean) {
  const baseline = (dark ? BACKGROUND_METEOR.dark : BACKGROUND_METEOR.light).opacity;
  const energy = baseline * BACKGROUND_METEOR.tipAlpha * BACKGROUND_METEOR.referenceWidth * gain;
  const coreWidth = fireball ? 2.6 + gain * 0.1 : 1.8;
  const plumeWidth = coreWidth * (fireball ? 2.8 : 2);
  const haloWidth = coreWidth * (fireball ? 6 : 4);
  return { coreWidth, plumeWidth, haloWidth,
    coreAlpha: energy * 0.8 / coreWidth,
    plumeAlpha: energy * 0.15 / plumeWidth,
    haloAlpha: energy * 0.05 / haloWidth,
    headAlpha: Math.min(0.98, baseline * BACKGROUND_METEOR.headAlpha * gain),
  };
}
