function getTimeMatch(value) {
  if (typeof value !== "string") return null;
  return value.trim().match(/[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
}

export function parseDateValue(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split("-").map(Number);
      return new Date(year, month - 1, day);
    }

    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      return new Date(trimmed.replace(" ", "T"));
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function hasMeaningfulTime(value) {
  const timeMatch = getTimeMatch(value);
  if (timeMatch) {
    return Number(timeMatch[1]) !== 0
      || Number(timeMatch[2]) !== 0
      || Number(timeMatch[3] || 0) !== 0;
  }

  const date = parseDateValue(value);
  if (!date) return false;

  return date.getHours() !== 0
    || date.getMinutes() !== 0
    || date.getSeconds() !== 0;
}

export function formatDate(value) {
  if (!value) return "-";
  const date = parseDateValue(value);
  if (!date) return String(value);
  return date.toLocaleDateString("en-GB");
}

export function formatTime(value) {
  if (!value) return "-";
  const date = parseDateValue(value);
  if (!date) return "-";
  if (!hasMeaningfulTime(value)) return "-";

  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDateTime(value) {
  if (!value) return "-";
  const date = parseDateValue(value);
  if (!date) return String(value);
  if (!hasMeaningfulTime(value)) return formatDate(value);

  return `${formatDate(value)} ${formatTime(value)}`;
}

export function toDateInputValue(value) {
  const date = parseDateValue(value);
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toTimeInputValue(value) {
  const date = parseDateValue(value);
  if (!date || !hasMeaningfulTime(value)) return "";

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function buildScheduledDateTime(dateValue, timeValue) {
  if (!dateValue || !timeValue) return "";
  return `${dateValue} ${timeValue}:00`;
}

export function compareDateValues(a, b) {
  const first = parseDateValue(a);
  const second = parseDateValue(b);

  if (!first && !second) return 0;
  if (!first) return 1;
  if (!second) return -1;

  return first.getTime() - second.getTime();
}
