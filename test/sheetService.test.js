const test = require('node:test');
const assert = require('node:assert/strict');
const { parseGoogleSheetPayload, formatSheetRowsForPrompt } = require('../sheetService');

test('parses Google visualization rows into simple objects', () => {
  const payload = {
    version: '0.6',
    status: 'ok',
    table: {
      cols: [
        { label: 'Question', type: 'string' },
        { label: 'Answer', type: 'string' }
      ],
      rows: [
        { c: [{ v: 'What services do you offer?' }, { v: 'We provide surveys and engineering support.' }] },
        { c: [{ v: 'How fast can I get a quote?' }, { v: 'Typically within one business day.' }] }
      ]
    }
  };

  const rows = parseGoogleSheetPayload(payload);

  assert.deepEqual(rows, [
    { Question: 'What services do you offer?', Answer: 'We provide surveys and engineering support.' },
    { Question: 'How fast can I get a quote?', Answer: 'Typically within one business day.' }
  ]);
});

test('formats rows into a compact prompt snippet', () => {
  const rows = [
    { Question: 'What services do you offer?', Answer: 'We provide surveys and engineering support.' }
  ];

  const text = formatSheetRowsForPrompt(rows, 5);

  assert.match(text, /Question/);
  assert.match(text, /We provide surveys/);
});
