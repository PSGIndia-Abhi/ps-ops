import PlacesSearchInput from "./PlacesSearchInput";

// Address search for the Add Site form. Picking a suggestion hands the
// parent the full address plus coordinates (used for the site's geofence).
// Built on Places API (New) via PlacesSearchInput - see that file for why
// the legacy Autocomplete widget is no longer used.
export default function PlaceAutocomplete({
  value,
  onPlaceSelected,
}) {
  return (
    <PlacesSearchInput
      value={value}
      onSelect={(place) => {
        // Same guard as before: a place without coordinates is ignored.
        if (place.latitude == null || place.longitude == null) return;

        onPlaceSelected({
          address: place.address,
          placeId: place.placeId,
          latitude: place.latitude,
          longitude: place.longitude,
          city: place.city,
          state: place.state,
          postalCode: place.postalCode,
          country: place.country,
        });
      }}
      inputProps={{
        placeholder: "Search address...",
        style: { width: "100%" },
      }}
    />
  );
}
