export type PlaceAddressDetails = {
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  formattedAddress: string | null;
};

export type PlaceSuggestion = {
  description: string;
  placeId: string;
};
