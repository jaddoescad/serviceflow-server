import type { PlaceAddressDetails, PlaceSuggestion } from '../types/google-places';

const GOOGLE_MAPS_API_KEY =
  process.env.GOOGLE_MAPS_API_KEY?.trim() ??
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ??
  null;

const AUTOCOMPLETE_ENDPOINT =
  "https://maps.googleapis.com/maps/api/place/autocomplete/json";
const PLACE_DETAILS_ENDPOINT =
  "https://maps.googleapis.com/maps/api/place/details/json";

type AutocompletePrediction = {
  description?: string;
  place_id?: string;
  structured_formatting?: {
    main_text?: string;
  };
};

type PlaceDetailsComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type PlaceDetailsResponse = {
  status?: string;
  result?: {
    formatted_address?: string;
    address_components?: PlaceDetailsComponent[];
  };
};

const getCityComponent = (components: PlaceDetailsComponent[]) => {
  return (
    components.find((component) => component.types?.includes("locality")) ??
    components.find((component) => component.types?.includes("postal_town")) ??
    components.find((component) => component.types?.includes("sublocality")) ??
    components.find((component) =>
      component.types?.includes("administrative_area_level_2")
    ) ??
    null
  );
};

const getComponentByType = (
  components: PlaceDetailsComponent[] | undefined,
  ...types: string[]
) => {
  if (!components || components.length === 0) {
    return null;
  }

  return (
    components.find((component) => component.types?.some((type) => types.includes(type))) ?? null
  );
};

export const isServerGoogleMapsConfigured = () => Boolean(GOOGLE_MAPS_API_KEY);

export const fetchGooglePlaceSuggestions = async (
  input: string
): Promise<PlaceSuggestion[]> => {
  if (!GOOGLE_MAPS_API_KEY) {
    return [];
  }

  const query = input.trim();
  if (!query) {
    return [];
  }

  const params = new URLSearchParams({
    input: query,
    key: GOOGLE_MAPS_API_KEY,
    types: "address",
  });

  const response = await fetch(`${AUTOCOMPLETE_ENDPOINT}?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch place suggestions (${response.status})`);
  }

  const payload: { status?: string; predictions?: AutocompletePrediction[] } =
    await response.json();

  if (payload.status === "ZERO_RESULTS") {
    return [];
  }

  if (payload.status !== "OK" || !payload.predictions) {
    throw new Error(`Place autocomplete failed with status "${payload.status ?? "UNKNOWN"}"`);
  }

  return payload.predictions
    .filter((prediction): prediction is Required<Pick<AutocompletePrediction, "place_id">> &
      AutocompletePrediction => Boolean(prediction.place_id))
    .map((prediction) => ({
      description:
        prediction.description ?? prediction.structured_formatting?.main_text ?? "",
      placeId: prediction.place_id!,
    }))
    .filter((suggestion) => Boolean(suggestion.description && suggestion.placeId));
};

export const fetchGooglePlaceAddressDetails = async (
  placeId: string
): Promise<PlaceAddressDetails | null> => {
  if (!GOOGLE_MAPS_API_KEY) {
    return null;
  }

  const trimmedPlaceId = placeId.trim();
  if (!trimmedPlaceId) {
    return null;
  }

  const params = new URLSearchParams({
    place_id: trimmedPlaceId,
    key: GOOGLE_MAPS_API_KEY,
    fields: "address_components,formatted_address",
  });

  const response = await fetch(`${PLACE_DETAILS_ENDPOINT}?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch place details (${response.status})`);
  }

  const payload: PlaceDetailsResponse = await response.json();

  if (payload.status === "ZERO_RESULTS") {
    return null;
  }

  if (payload.status !== "OK" || !payload.result) {
    throw new Error(`Place details failed with status "${payload.status ?? "UNKNOWN"}"`);
  }

  const components = payload.result.address_components ?? [];
  const streetNumber = getComponentByType(components, "street_number")?.long_name ?? "";
  const streetName = getComponentByType(components, "route")?.long_name ?? "";
  const street =
    [streetNumber, streetName].filter((part) => part && part.trim()).join(" ") || null;
  const cityComponent = getCityComponent(components);
  const stateComponent = getComponentByType(components, "administrative_area_level_1");
  const postalCodeComponent = getComponentByType(components, "postal_code");

  return {
    street,
    city: cityComponent?.long_name ?? cityComponent?.short_name ?? null,
    state: stateComponent?.short_name ?? stateComponent?.long_name ?? null,
    postalCode: postalCodeComponent?.long_name ?? postalCodeComponent?.short_name ?? null,
    formattedAddress: payload.result.formatted_address ?? null,
  };
};
