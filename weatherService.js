const REGION_COORDINATES = {
  dublin: { latitude: 53.3498, longitude: -6.2603, label: 'Dublin' },
  'cork harbour': { latitude: 51.8491, longitude: -8.2943, label: 'Cork Harbour' },
  cork: { latitude: 51.8985, longitude: -8.4756, label: 'Cork' },
  galway: { latitude: 53.2707, longitude: -9.0568, label: 'Galway' }
};

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function detectWeatherIntent(message) {
  const text = normalizeText(message);
  if (!text) {
    return false;
  }

  return /weather|forecast|rain|wind|temperature|temp|site visit weather|outdoor condition|conditions/.test(text);
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

function describeWeatherCode(code) {
  const mapping = {
    0: 'clear sky',
    1: 'mostly clear',
    2: 'partly cloudy',
    3: 'overcast',
    45: 'fog',
    48: 'depositing rime fog',
    51: 'light drizzle',
    53: 'moderate drizzle',
    55: 'dense drizzle',
    61: 'slight rain',
    63: 'moderate rain',
    65: 'heavy rain',
    71: 'slight snow fall',
    73: 'moderate snow fall',
    75: 'heavy snow fall',
    80: 'slight rain showers',
    81: 'moderate rain showers',
    82: 'violent rain showers',
    95: 'thunderstorm'
  };

  return mapping[code] || 'mixed conditions';
}

async function fetchCurrentWeather(region) {
  const coordinates = getCoordinatesForRegion(region);
  if (!coordinates) {
    throw new Error(`No weather coordinates configured for region: ${region}`);
  }

  const params = new URLSearchParams({
    latitude: String(coordinates.latitude),
    longitude: String(coordinates.longitude),
    current: 'temperature_2m,precipitation,wind_speed_10m,weather_code',
    timezone: 'auto'
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Weather API request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const current = payload.current || {};

  return {
    region: coordinates.label,
    temperatureC: current.temperature_2m,
    precipitationMm: current.precipitation,
    windSpeedKmh: current.wind_speed_10m,
    weatherCode: current.weather_code,
    summary: describeWeatherCode(current.weather_code)
  };
}

function buildWeatherAdvisory(weather) {
  const wind = Number.isFinite(weather.windSpeedKmh) ? weather.windSpeedKmh : null;
  const rain = Number.isFinite(weather.precipitationMm) ? weather.precipitationMm : null;

  if ((wind != null && wind >= 40) || (rain != null && rain >= 3)) {
    return 'Site visits may need extra safety controls or rescheduling due to current conditions.';
  }

  return 'Conditions look suitable for a standard site visit today, subject to normal safety checks.';
}

async function buildWeatherReply(message, rows = []) {
  if (!detectWeatherIntent(message)) {
    return null;
  }

  const region = extractRegionFromMessage(message, rows);
  if (!region) {
    const regions = uniqueRegionsFromRows(rows);
    if (regions.length > 0) {
      return `I can provide live weather for site planning. Please specify a region: ${regions.join(', ')}.`;
    }
    return 'I can provide live weather for site planning, but I need a region (for example: Dublin or Galway).';
  }

  const coordinates = getCoordinatesForRegion(region);
  if (!coordinates) {
    return `I cannot provide live weather for ${region} yet. Try Dublin, Cork Harbour, or Galway.`;
  }

  const weather = await fetchCurrentWeather(region);
  const advisory = buildWeatherAdvisory(weather);

  return [
    `Live weather for ${weather.region}: ${weather.summary}.`,
    `Temperature: ${weather.temperatureC} C, Wind: ${weather.windSpeedKmh} km/h, Precipitation: ${weather.precipitationMm} mm.`,
    advisory
  ].join(' ');
}

module.exports = {
  detectWeatherIntent,
  uniqueRegionsFromRows,
  extractRegionFromMessage,
  getCoordinatesForRegion,
  buildWeatherReply,
  fetchCurrentWeather
};
