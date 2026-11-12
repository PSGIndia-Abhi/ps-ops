import { initialsOf } from "./avatarUtils";

// Gradient avatar with up to two initials, coloured consistently per name.
// Leading spaces/symbols are skipped so names like " Chai days" still get initials.

const GRADIENTS = [
  ["#6366f1", "#8b5cf6"],
  ["#0ea5e9", "#2563eb"],
  ["#14b8a6", "#0d9488"],
  ["#f59e0b", "#ef4444"],
  ["#ec4899", "#8b5cf6"],
  ["#22c55e", "#0ea5e9"],
  ["#f97316", "#db2777"],
  ["#64748b", "#334155"],
];

function hash(text) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export default function CompanyAvatar({ name, size = 40, className = "" }) {
  const [a, b] = GRADIENTS[hash(String(name || "").trim().toLowerCase()) % GRADIENTS.length];
  return (
    <span
      className={`company-avatar ${className}`}
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        fontSize: Math.round(size * 0.38),
        background: `linear-gradient(135deg, ${a}, ${b})`,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}
