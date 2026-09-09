// Pulls the address parts the app cares about out of a Places result.
export function parsePlaceComponents(place) {
  const components = place?.address_components || [];
  const getComponent = (type) => components.find((c) => c.types.includes(type))?.long_name || "";

  return {
    address: place?.formatted_address || place?.name || "",
    city: getComponent("locality") || getComponent("administrative_area_level_2") || getComponent("sublocality"),
    state: getComponent("administrative_area_level_1"),
  };
}
