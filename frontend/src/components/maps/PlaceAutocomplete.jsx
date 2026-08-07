import { useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";

export default function PlaceAutocomplete({
  value,
  onPlaceSelected,
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);

  const places = useMapsLibrary("places");

  // Keep the input synchronized with the parent value
  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value || "";
    }
  }, [value]);

  useEffect(() => {
    if (!places || !inputRef.current) return;

    autocompleteRef.current = new places.Autocomplete(inputRef.current, {
      fields: [
        "formatted_address",
        "geometry",
        "address_components",
        "place_id",
      ],
    });

    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current.getPlace();

      if (!place?.geometry) return;

      const components = place.address_components || [];

      const getComponent = (type) =>
        components.find((c) => c.types.includes(type))?.long_name || "";

      onPlaceSelected({
        address: place.formatted_address,
        placeId: place.place_id,
        latitude: place.geometry.location.lat(),
        longitude: place.geometry.location.lng(),
        city:
          getComponent("locality") ||
          getComponent("administrative_area_level_2"),
        state: getComponent("administrative_area_level_1"),
        postalCode: getComponent("postal_code"),
        country: getComponent("country"),
      });
    });

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(
          autocompleteRef.current
        );
      }
    };
  }, [places, onPlaceSelected]);

  return (
    <input
      ref={inputRef}
      placeholder="Search address..."
      style={{ width: "100%" }}
    />
  );
}