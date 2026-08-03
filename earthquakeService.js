const REGION_COORDINATES = {
  dublin: { latitude: 53.3498, longitude: -6.2603, label: 'Dublin' },
  'cork harbour': { latitude: 51.8491, longitude: -8.2943, label: 'Cork Harbour' },
  cork: { latitude: 51.8985, longitude: -8.4756, label: 'Cork' },
  galway: { latitude: 53.2707, longitude: -9.0568, label: 'Galway' }
};

const DEFAULT_SEARCH_RADIUS_KM = 250;
const DEFAULT_LOOKBACK_DAYS = 30;

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function detectEarthquakeIntent(message) {
  const text = normalizeText(message);
  if (!text) {
    return false;
  }

  return /earthquake|earthquakes|seismic|tremor|fault activity|quake/.test(text);
}

function uniqueRegionsFromRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const row of rows) {
    const raw = String(row.region || row.Region || '').trim();
    if (!raw) {
      continue;
    }

    const key = raw.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(raw);
  }

  return result;
}

function extractRegionFromMessage(message, rows = []) {
  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage) {
    return null;
  }

  const rowRegions = uniqueRegionsFromRows(rows);
  for (const region of rowRegions) {
    const normalizedRegion = normalizeText(region);
    if (normalizedRegion && normalizedMessage.includes(normalizedRegion)) {
      return region;
    }
  }

  for (const key of Object.keys(REGION_COORDINATES)) {
    if (normalizedMessage.includes(key)) {
      return REGION_COORDINATES[key].label;
    }
  }

  return null;
}

function getCoordinatesForRegion(region) {
  const key = normalizeText(region);
  return REGION_COORDINATES[key] || null;
}

function buildStartDate(days) {
  const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
  return startDate.toISOString();
}

function toMagnitude(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toDepthKm(feature) {
  const depth = feature?.geometry?.coordinates?.[2];
  return typeof depth === 'number' && Number.isFinite(depth) ? depth : null;
}

function summarizeEarthquakeActivity(region, features, options = {}) {
  const lookbackDays = options.lookbackDays || DEFAULT_LOOKBACK_DAYS;
  const radiusKm = options.radiusKm || DEFAULT_SEARCH_RADIUS_KM;
  const events = Array.isArray(features) ? features : [];

  if (events.length === 0) {
    return [
      `USGS recent seismic activity for ${region}: no recorded earthquakes within ${radiusKm} km in the last ${lookbackDays} days.`,
      'No recent seismic events are showing for this area in the USGS feed.'
    ].join(' ');
  }

  const sortedByMagnitude = [...events].sort((left, right) => {
    const leftMagnitude = toMagnitude(left?.properties?.mag) ?? -Infinity;
    const rightMagnitude = toMagnitude(right?.properties?.mag) ?? -Infinity;
    return rightMagnitude - leftMagnitude;
  });

  const strongest = sortedByMagnitude[0];
  const mostRecent = events[0];
  const strongCount = events.filter((event) => {
    const magnitude = toMagnitude(event?.properties?.mag);
    return magnitude != null && magnitude >= 2.5;
  }).length;

  const strongestMagnitude = toMagnitude(strongest?.properties?.mag);
  const strongestPlace = strongest?.properties?.place || 'the area';
  const strongestDepth = toDepthKm(strongest);
  const recentTime = mostRecent?.properties?.time ? new Date(mostRecent.properties.time).toISOString().slice(0, 10) : 'recently';

  const summaryParts = [
    `USGS recent seismic activity for ${region}: ${events.length} recorded earthquake${events.length === 1 ? '' : 's'} within ${radiusKm} km in the last ${lookbackDays} days.`,
    strongestMagnitude != null
      ? `Largest event: M${strongestMagnitude.toFixed(1)} near ${strongestPlace}${strongestDepth != null ? ` at ${strongestDepth.toFixed(1)} km depth` : ''}.`
      : 'Largest event magnitude is not available in the current feed.',
    `Most recent event listed by USGS was on ${recentTime}.`,
    strongCount > 0
      ? `${strongCount} event${strongCount === 1 ? '' : 's'} reached magnitude 2.5 or above.`
      : 'No events reached magnitude 2.5 in this time window.'
  ];

  return summaryParts.join(' ');
}

async function fetchRecentEarthquakes(region, options = {}) {
  const coordinates = getCoordinatesForRegion(region);
  if (!coordinates) {
    throw new Error(`No earthquake area configured for region: ${region}`);
  }

  const radiusKm = options.radiusKm || DEFAULT_SEARCH_RADIUS_KM;
  const lookbackDays = options.lookbackDays || DEFAULT_LOOKBACK_DAYS;
  const params = new URLSearchParams({
    format: 'geojson',
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    maxradiuskm: String(radiusKm),
    starttime: buildStartDate(lookbackDays),
    orderby: 'time',
    limit: '20'
  });

  const response = await fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`USGS earthquake request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const features = Array.isArray(payload.features) ? payload.features : [];

  return {
    region: coordinates.label,
    radiusKm,
    lookbackDays,
    count: typeof payload.metadata?.count === 'number' ? payload.metadata.count : features.length,
    features,
    summary: summarizeEarthquakeActivity(coordinates.label, features, { radiusKm, lookbackDays })
  };
}

async function buildEarthquakeReply(message, rows = []) {
  if (!detectEarthquakeIntent(message)) {
    return null;
  }

  const region = extractRegionFromMessage(message, rows);
  if (!region) {
    const regions = uniqueRegionsFromRows(rows);
    if (regions.length > 0) {
      return `I can provide recent USGS seismic activity by area. Please specify a region: ${regions.join(', ')}.`;
    }
    return 'I can provide recent USGS seismic activity by area, but I need a region (for example: Dublin or Galway).';
  }

  const coordinates = getCoordinatesForRegion(region);
  if (!coordinates) {
    return `I cannot provide USGS seismic activity for ${region} yet. Try Dublin, Cork Harbour, or Galway.`;
  }

  const earthquakeData = await fetchRecentEarthquakes(region);
  return earthquakeData.summary;
}

module.exports = {
  detectEarthquakeIntent,
  uniqueRegionsFromRows,
  extractRegionFromMessage,
  getCoordinatesForRegion,
  summarizeEarthquakeActivity,
  buildEarthquakeReply,
  fetchRecentEarthquakes
};