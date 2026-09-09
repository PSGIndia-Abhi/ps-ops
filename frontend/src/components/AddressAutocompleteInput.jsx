import { useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { parsePlaceComponents } from "../utils/googleMaps";

// A plain text input that upgrades itself into a Google Places autocomplete
// field once the Maps "places" library loads. Typing shows Google's own
// dropdown of matching addresses; picking one fires onPlaceSelected with the
// parsed address/city/state. Uses the shared <APIProvider> from main.jsx
// (via useMapsLibrary) instead of loading its own copy of the Maps script —
// loading the script twice made Google log "included multiple times" and
// left window.google.maps.places undefined, silently breaking this input.
// If the library fails to load (no key, offline, etc.) this still behaves
// like a normal input — nothing else breaks.
export default function AddressAutocompleteInput({
  value,
  onChange,
  onPlaceSelected,
  placeholder,
  className,
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const places = useMapsLibrary("places");

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const autocomplete = new places.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "address_components", "name"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place) return;
      onPlaceSelected?.(parsePlaceComponents(place));
    });

    autocompleteRef.current = autocomplete;

    return () => {
      if (window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocomplete);
      }
      autocompleteRef.current = null;
    };
  }, [places, onPlaceSelected]);

  return (
    <input
      ref={inputRef}
      // type="search" (not "text") is what actually keeps Chrome's own
      // saved-address autofill dropdown from taking over this field —
      // autoComplete="off" alone isn't enough once a nearby label says
      // "Address"; Chrome ignores it for fields it thinks are addresses.
      type="search"
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoComplete="off"
      name="site-address-search"
    />
  );
}
