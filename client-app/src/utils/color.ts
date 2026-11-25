/** Lightens (positive amount) or darkens (negative) a #rrggbb color - used to build a two-stop gradient from a single brand color instead of hand-picking a second color per caller. */
export function shadeColor(hex: string, amount: number): string {
  const clamp = (c: number) => Math.max(0, Math.min(255, c));
  const toHex = (c: number) => clamp(c).toString(16).padStart(2, '0');
  const r = parseInt(hex.slice(1, 3), 16) + Math.round(255 * amount);
  const g = parseInt(hex.slice(3, 5), 16) + Math.round(255 * amount);
  const b = parseInt(hex.slice(5, 7), 16) + Math.round(255 * amount);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
