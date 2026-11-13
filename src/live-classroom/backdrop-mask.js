export function writeBackdropMask(pixels, color, coverage) {
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
  const start = 0.045 + 0.22 * (coverage - 0.42);
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
    const edge = Math.min(1, Math.max(0, (difference - start) / 0.09));
    pixels[i + 3] = 255 * edge * edge * (3 - 2 * edge);
  }
}
