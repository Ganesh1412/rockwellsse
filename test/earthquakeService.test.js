const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectEarthquakeIntent,
  uniqueRegionsFromRows,
  extractRegionFromMessage,
  getCoordinatesForRegion,
  summarizeEarthquakeActivity
} = require('../earthquakeService');

test('detects earthquake intent keywords', () => {
  assert.equal(detectEarthquakeIntent('Show recent earthquake activity near Dublin.'), true);
  assert.equal(detectEarthquakeIntent('How much is the Residential Structural Survey?'), false);
});

test('collects unique regions from rows', () => {
  const rows = [
    { region: 'Dublin' },
    { region: 'Galway' },
    { region: 'dublin' },
    { Region: 'Cork Harbour' }
  ];

  const result = uniqueRegionsFromRows(rows);
  assert.deepEqual(result, ['Dublin', 'Galway', 'Cork Harbour']);
});

test('extracts region from message when region exists in rows', () => {
  const rows = [
    { region: 'Dublin' },
    { region: 'Galway' }
  ];

  const region = extractRegionFromMessage('Any seismic activity in Galway for this area?', rows);
  assert.equal(region, 'Galway');
});

test('resolves configured coordinates for supported region', () => {
  const coordinates = getCoordinatesForRegion('Dublin');
  assert.equal(Boolean(coordinates), true);
  assert.equal(typeof coordinates.latitude, 'number');
  assert.equal(typeof coordinates.longitude, 'number');
});

test('summarizes recent earthquake activity from usgs features', () => {
  const now = Date.UTC(2026, 7, 3, 12, 0, 0);
  const features = [
    {
      properties: { mag: 1.2, place: '12 km W of Galway', time: now },
      geometry: { coordinates: [-9.1, 53.3, 5.4] }
    },
    {
      properties: { mag: 3.1, place: '20 km S of Galway', time: now - 3600000 },
      geometry: { coordinates: [-9.2, 53.2, 11.2] }
    }
  ];

  const summary = summarizeEarthquakeActivity('Galway', features, { radiusKm: 250, lookbackDays: 30 });
  assert.match(summary, /2 recorded earthquakes/);
  assert.match(summary, /Largest event: M3.1 near 20 km S of Galway at 11.2 km depth/);
  assert.match(summary, /Most recent event listed by USGS was on 2026-08-03/);
  assert.match(summary, /1 event reached magnitude 2.5 or above/);
});