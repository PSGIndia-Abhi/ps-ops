// Up to two initials from a name. Leading spaces/symbols are skipped,
// so names like " Chai days" or "(3rd) Place" still get initials.
export function initialsOf(name) {
  const words = String(name || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "?";
  const first = words[0][0];
  const second = words.length > 1 ? words[1][0] : words[0][1] || "";
  return `${first}${second}`.toUpperCase();
}
