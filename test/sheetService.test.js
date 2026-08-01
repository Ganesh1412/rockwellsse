const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseGoogleSheetPayload, formatSheetRowsForPrompt, buildSheetAnswer, buildSheetReply } = require('../sheetService');

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

test('builds a helpful service list answer from sheet rows', () => {
  const rows = [
    { service_name: 'Residential Structural Survey', category: 'Structural Surveys', fee_eur: '650' },
    { service_name: 'Pre-Purchase Structural Inspection', category: 'Structural Inspections', fee_eur: '480' }
  ];

  const answer = buildSheetAnswer('What services do you offer?', rows);

  assert.match(answer, /Residential Structural Survey/);
  assert.match(answer, /Pre-Purchase Structural Inspection/);
});

test('builds a pricing answer for a specific service', () => {
  const rows = [
    { service_name: 'Residential Structural Survey', category: 'Structural Surveys', fee_eur: '650' },
    { service_name: 'Pre-Purchase Structural Inspection', category: 'Structural Inspections', fee_eur: '480' }
  ];

  const answer = buildSheetAnswer('How much is the Residential Structural Survey?', rows);

  assert.match(answer, /650/);
});

test('builds a fallback reply from sheet rows when no AI backend is available', () => {
  const rows = [
    { service_name: 'Residential Structural Survey', category: 'Structural Surveys', fee_eur: '650' },
    { service_name: 'Pre-Purchase Structural Inspection', category: 'Structural Inspections', fee_eur: '480' }
  ];

  const reply = buildSheetReply('How much is the Residential Structural Survey?', rows);

  assert.match(reply, /650/);
});

test('exposes the sheet service on window for browser use', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'sheetService.js'), 'utf8');
  const context = {
    window: {},
    document: {},
    console,
    setTimeout,
    clearTimeout,
    URL,
    Buffer,
    module: { exports: {} },
    exports: {},
    require,
    globalThis: {}
  };
  context.window = context;
  context.globalThis = context;

  vm.runInNewContext(source, context, { filename: 'sheetService.js' });

  assert.ok(context.window.rockwellSheetService);
  assert.equal(typeof context.window.rockwellSheetService.buildSheetReply, 'function');
});
