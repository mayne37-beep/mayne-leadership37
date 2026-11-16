/** Builds the same matte for Mayne Studio's keyed preview and Program output.
 * The fourth parameter is optional so existing Classroom Response Studio
 * callers retain the original thresholds and appearance. */
export function writeBackdropMask(pixels, color, coverage, controls = {}) {
  const strength = Number.isFinite(controls.keyStrength)
    ? Math.max(0, Math.min(100, controls.keyStrength)) : 50;
  const softness = Number.isFinite(controls.keySoftness)
    ? Math.max(0, Math.min(100, controls.keySoftness)) : 50;
  const despill = Number.isFinite(controls.keyDespill)
    ? Math.max(0, Math.min(100, controls.keyDespill)) / 100 : 0;
  // 0% disables removal completely, letting instructors compare against raw.
  if (strength === 0) {
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
    return;
  }
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const light = red + green + blue;
  const keyIntensity = Math.max(light, 24);
  const keyRed = (red - light / 3) / keyIntensity;
  const keyGreen = (green - light / 3) / keyIntensity;
  const keyBlue = (blue - light / 3) / keyIntensity;
  const saturation = Math.max(keyRed, keyGreen, keyBlue) - Math.min(keyRed, keyGreen, keyBlue);
  // Saturated backdrops keep their hue in shadows. With a neutral color, brightness matters too.
  const lightWeight = Math.max(0.12, 0.85 - 2.5 * saturation);
  // Strength moves the threshold: higher numbers remove more near-key colors.
  // A 50%/50% configuration matches the long-standing chroma algorithm.
  const start = Math.max(0, Math.min(0.26, 0.045 + 0.22 * (coverage - 0.42)
    + (strength - 50) * 0.0016));
  const transition = 0.015 + softness * 0.0015;
  const keyedChannel = keyGreen >= keyRed && keyGreen >= keyBlue ? 1
    : keyBlue >= keyRed ? 2 : 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const brightness = pixels[i] + pixels[i + 1] + pixels[i + 2];
    const intensity = Math.max(24, brightness);
    const gray = brightness / 3;
    const difference = Math.max(
      Math.abs((pixels[i] - gray) / intensity - keyRed),
      Math.abs((pixels[i + 1] - gray) / intensity - keyGreen),
      Math.abs((pixels[i + 2] - gray) / intensity - keyBlue),
      Math.abs(brightness - light) * lightWeight / 765,
    );
    const edge = Math.min(1, Math.max(0, (difference - start) / transition));
    const alpha = edge * edge * (3 - 2 * edge);
    pixels[i + 3] = Math.round(255 * alpha);
    if (despill && alpha > 0 && alpha < 1) {
      // Lower green/blue halo only at edges, without changing fully opaque skin.
      const channel = i + keyedChannel;
      const other = (pixels[i] + pixels[i + 1] + pixels[i + 2] - pixels[channel]) / 2;
      if (pixels[channel] > other) {
        pixels[channel] = Math.round(pixels[channel] -
          (pixels[channel] - other) * despill * (1 - alpha));
      }
    }
  }
}
