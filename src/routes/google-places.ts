import { Router } from 'express';
import {
  fetchGooglePlaceAddressDetails,
  fetchGooglePlaceSuggestions,
  isServerGoogleMapsConfigured,
} from '../lib/google-places';

const router = Router();

router.get('/suggestions', async (req, res) => {
  if (!isServerGoogleMapsConfigured()) {
    return res.json({
      suggestions: [],
      error: 'Google Maps API key is not configured.',
    });
  }

  const query = (req.query.query as string | undefined)?.trim() ?? '';
  if (!query) {
    return res.json({ suggestions: [] });
  }

  try {
    const suggestions = await fetchGooglePlaceSuggestions(query);
    return res.json({ suggestions });
  } catch (error) {
    console.error('Failed to fetch Google Place suggestions', error);
    const message =
      error instanceof Error ? error.message : 'Failed to fetch place suggestions.';
    return res.status(502).json({ suggestions: [], error: message });
  }
});

router.get('/details', async (req, res) => {
  if (!isServerGoogleMapsConfigured()) {
    return res.json({ details: null, error: 'Google Maps API key is not configured.' });
  }

  const placeId = (req.query.placeId as string | undefined)?.trim() ?? '';
  if (!placeId) {
    return res.json({ details: null });
  }

  try {
    const details = await fetchGooglePlaceAddressDetails(placeId);
    return res.json({ details });
  } catch (error) {
    console.error('Failed to fetch Google Place details', error);
    const message =
      error instanceof Error ? error.message : 'Failed to fetch place details.';
    return res.status(502).json({ details: null, error: message });
  }
});

export default router;
