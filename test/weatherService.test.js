const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectWeatherIntent,
  uniqueRegionsFromRows,
  extractRegionFromMessage,
  getCoordinatesForRegion
} = require('../weatherService');

test('detects weather intent keywords', () => {
  assert.equal(detectWeatherIntent('What is the weather in Dublin for tomorrow site visit?'), true);
  assert.equal(detectWeatherIntent('How much is the Residential Structural Survey?'), false);
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

  const region = extractRegionFromMessage('Is the weather okay in Galway for a survey?', rows);
  assert.equal(region, 'Galway');
});

test('resolves configured coordinates for supported region', () => {
  const coordinates = getCoordinatesForRegion('Dublin');
  assert.equal(Boolean(coordinates), true);
  assert.equal(typeof coordinates.latitude, 'number');
  assert.equal(typeof coordinates.longitude, 'number');
});
