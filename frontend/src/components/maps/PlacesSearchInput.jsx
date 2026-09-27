import { useEffect, useRef, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";

// Shared address search box built on Places API (New). The legacy
// google.maps.places.Autocomplete widget is not available to Maps projects
// created after March 2025, so this keeps the app's own <input> (existing
// page CSS still applies) and renders a small suggestion list under it.
//
// Keeps Google calls to the minimum:
// - nothing is requested until the user has typed MIN_CHARS characters,
// - typing is debounced, so only the pause after typing triggers a request,
// - repeated queries in the same search are served from a local cache,
// - value changes coming from the parent (pre-filling, form reset) never
//   trigger a request - only real typing does,
// - one session token covers every keystroke of a search plus the final
//   details lookup, so Google bills the search as a single session,
// - the details lookup asks only for the fields the app stores.

const MIN_CHARS = 3;
const DEBOUNCE_MS = 350;
const DETAIL_FIELDS = ["formattedAddress", "location", "addressComponents"];

function toResult(place, prediction) {
  const components = place.addressComponents || [];
  const getComponent = (type) =>
    components.find((c) => c.types.includes(type))?.longText || "";

  return {
    address: place.formattedAddress || prediction.text?.text || "",
    placeId: place.id || prediction.placeId,
    latitude: place.location ? place.location.lat() : null,
    longitude: place.location ? place.location.lng() : null,
    city:
      getComponent("locality") ||
      getComponent("administrative_area_level_2"),
    sublocality: getComponent("sublocality"),
    state: getComponent("administrative_area_level_1"),
    postalCode: getComponent("postal_code"),
    country: getComponent("country"),
  };
}

export default function PlacesSearchInput({
  value,
  onInput,
  onSelect,
  inputProps,
}) {
  const places = useMapsLibrary("places");

  const [text, setText] = useState(value || "");
  const [prevValue, setPrevValue] = useState(value);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const sessionTokenRef = useRef(null);
  const cacheRef = useRef(new Map());
  const timerRef = useRef(null);
  const requestIdRef = useRef(0);

  // Parent-driven value changes (pre-fill, reset) only update the text.
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value || "");
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function endSession() {
    sessionTokenRef.current = null;
    cacheRef.current.clear();
  }

  function closeList() {
    setOpen(false);
    setActiveIndex(-1);
  }

  async function fetchSuggestions(query, cacheKey, requestId) {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new places.AutocompleteSessionToken();
    }

    try {
      const { suggestions: results } =
        await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: sessionTokenRef.current,
        });
      const predictions = results
        .map((s) => s.placePrediction)
        .filter(Boolean);

      cacheRef.current.set(cacheKey, predictions);
      if (requestId !== requestIdRef.current) return;

      setSuggestions(predictions);
      setActiveIndex(-1);
      setOpen(predictions.length > 0);
    } catch (err) {
      console.error("Address suggestions failed:", err);
      if (requestId === requestIdRef.current) {
        setSuggestions([]);
        closeList();
      }
    }
  }

  function handleChange(e) {
    const next = e.target.value;
    setText(next);
    onInput?.(next);

    clearTimeout(timerRef.current);
    const requestId = ++requestIdRef.current;
    const query = next.trim();

    if (!places || query.length < MIN_CHARS) {
      setSuggestions([]);
      closeList();
      return;
    }

    const cacheKey = query.toLowerCase();
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setActiveIndex(-1);
      setOpen(cached.length > 0);
      return;
    }

    timerRef.current = setTimeout(
      () => fetchSuggestions(query, cacheKey, requestId),
      DEBOUNCE_MS
    );
  }

  async function selectPrediction(prediction) {
    clearTimeout(timerRef.current);
    requestIdRef.current++;
    setSuggestions([]);
    closeList();
    setText(prediction.text?.text || "");

    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: DETAIL_FIELDS });
      const result = toResult(place, prediction);
      setText(result.address);
      onSelect?.(result);
    } catch (err) {
      console.error("Address details failed:", err);
    } finally {
      endSession();
    }
  }

  function handleKeyDown(e) {
    if (!open || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectPrediction(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      closeList();
    }
  }

  return (
    <span style={styles.wrapper}>
      <input
        {...inputProps}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={closeList}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
      />

      {open && suggestions.length > 0 && (
        <ul role="listbox" style={styles.list}>
          {suggestions.map((prediction, index) => (
            <li
              key={prediction.placeId}
              role="option"
              aria-selected={index === activeIndex}
              // mousedown (not click) so the input's blur doesn't close
              // the list before the selection registers
              onMouseDown={(e) => {
                e.preventDefault();
                selectPrediction(prediction);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              style={{
                ...styles.item,
                ...(index === activeIndex ? styles.itemActive : null),
              }}
            >
              <span style={styles.mainText}>
                {prediction.mainText?.text || prediction.text?.text}
              </span>
              {prediction.secondaryText?.text && (
                <span style={styles.secondaryText}>
                  {prediction.secondaryText.text}
                </span>
              )}
            </li>
          ))}
          <li aria-hidden="true" style={styles.attribution}>
            powered by Google
          </li>
        </ul>
      )}
    </span>
  );
}

const styles = {
  wrapper: {
    position: "relative",
    display: "block",
    width: "100%",
  },
  list: {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    zIndex: 1000,
    margin: 0,
    padding: "4px 0",
    listStyle: "none",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.12)",
    maxHeight: 280,
    overflowY: "auto",
    textAlign: "left",
  },
  item: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "8px 12px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1.3,
  },
  itemActive: {
    background: "#f3f4f6",
  },
  mainText: {
    color: "#111827",
    fontWeight: 500,
  },
  secondaryText: {
    color: "#6b7280",
    fontSize: 12,
  },
  attribution: {
    padding: "4px 12px 2px",
    fontSize: 11,
    color: "#9ca3af",
    textAlign: "right",
  },
};
