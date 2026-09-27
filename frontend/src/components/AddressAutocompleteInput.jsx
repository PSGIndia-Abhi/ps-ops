import PlacesSearchInput from "./maps/PlacesSearchInput";

// A plain text input with Google address suggestions. Typing shows matching
// addresses in a dropdown; picking one fires onPlaceSelected with the parsed
// address/city/state. Uses Places API (New) through PlacesSearchInput, which
// relies on the shared <APIProvider> from main.jsx (via useMapsLibrary)
// instead of loading its own copy of the Maps script. If the library fails
// to load (no key, offline, etc.) this still behaves like a normal input.
export default function AddressAutocompleteInput({
  value,
  onChange,
  onPlaceSelected,
  placeholder,
  className,
}) {
  return (
    <PlacesSearchInput
      value={value}
      onInput={onChange}
      onSelect={(place) =>
        onPlaceSelected?.({
          address: place.address,
          city: place.city || place.sublocality,
          state: place.state,
        })
      }
      inputProps={{
        // type="search" (not "text") is what actually keeps Chrome's own
        // saved-address autofill dropdown from taking over this field —
        // autoComplete="off" alone isn't enough once a nearby label says
        // "Address"; Chrome ignores it for fields it thinks are addresses.
        type: "search",
        className,
        placeholder,
        name: "site-address-search",
      }}
    />
  );
}
