const DEFAULT_ENDPOINT = process.env.CHAT_ENDPOINT || 'https://rockwellsse.fly.dev/api/chat';
const DEFAULT_TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS || 15000);

if (typeof fetch !== 'function') {
  console.error('Global fetch is unavailable. Run with Node.js 18+ to execute this probe.');
  process.exit(2);
}

const offTopicCases = [
  {
    name: 'off-topic-food-order',
    prompt: 'can I order food?',
    expectedKeywords: ['food', 'order', 'restaurant', 'support']
  },
  {
    name: 'off-topic-haiku',
    prompt: 'write a haiku about concrete foundations',
    expectedKeywords: ['haiku', 'poem', 'verse', 'concrete', 'foundation']
  },
  {
    name: 'off-topic-mars-capital',
    prompt: 'what is the capital of Mars?',
    expectedKeywords: ['mars', 'capital', 'planet', 'none']
  }
];

const inDomainCases = [
  {
    name: 'in-domain-survey-and-earthquakes',
    prompt: 'Give me the details for the Pre-Purchase Structural Inspection in Galway, and summarize recent earthquake activity in Galway from the USGS feed.',
    requiredKeywords: ['pre purchase structural inspection', 'galway', 'earthquake', 'usgs']
  },
  {
    name: 'in-domain-survey-pricing',
    prompt: 'How much is the Residential Structural Survey in Dublin?',
    requiredKeywords: ['residential structural survey', 'dublin', 'eur']
  },
  {
    name: 'in-domain-earthquakes-only',
    prompt: 'Show recent seismic activity in Cork Harbour.',
    requiredKeywords: ['cork harbour', 'seismic', 'earthquake']
  }
];

function normalize(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function containsAnyKeyword(text, keywords) {
  const normalized = normalize(text);
  return keywords.some((keyword) => normalized.includes(normalize(keyword)));
}

function countKeywordHits(text, keywords) {
  const normalized = normalize(text);
  return keywords.filter((keyword) => normalized.includes(normalize(keyword))).length;
}

function looksLikeStructuredSheetRow(text) {
  const normalized = normalize(text);
  const fieldHits = [
    'service_name:',
    'category:',
    'region:',
    'fee_eur:',
    'duration_days:',
    'slots_this_week:',
    'availability:'
  ].filter((field) => normalized.includes(field)).length;

  return fieldHits >= 3;
}

async function postChat(message) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const start = Date.now();

  try {
    const response = await fetch(DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: controller.signal
    });

    const bodyText = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(bodyText);
    } catch (error) {
      payload = { raw: bodyText };
    }

    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - start,
      reply: payload && typeof payload.reply === 'string' ? payload.reply : bodyText
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - start,
      reply: `Request failed: ${error.message}`
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runOffTopicCase(testCase) {
  const result = await postChat(testCase.prompt);
  const reply = result.reply || '';
  const redirectLike = containsAnyKeyword(reply, ['support', 'survey', 'engineering', 'cannot help', 'not related']);
  const contextual = countKeywordHits(reply, testCase.expectedKeywords) >= 1;
  const scriptedRow = looksLikeStructuredSheetRow(reply);
  const pass = result.ok && !scriptedRow && (contextual || redirectLike);

  return {
    type: 'off-topic',
    caseName: testCase.name,
    prompt: testCase.prompt,
    pass,
    reasons: {
      okHttp: result.ok,
      scriptedRow,
      contextual,
      redirectLike
    },
    latencyMs: result.latencyMs,
    reply
  };
}

async function runInDomainCase(testCase) {
  const result = await postChat(testCase.prompt);
  const reply = result.reply || '';
  const hitCount = countKeywordHits(reply, testCase.requiredKeywords);
  const requiredHitRatio = hitCount / testCase.requiredKeywords.length;
  const pass = result.ok && requiredHitRatio >= 0.5;

  return {
    type: 'in-domain',
    caseName: testCase.name,
    prompt: testCase.prompt,
    pass,
    reasons: {
      okHttp: result.ok,
      keywordHits: hitCount,
      requiredKeywords: testCase.requiredKeywords.length,
      requiredHitRatio
    },
    latencyMs: result.latencyMs,
    reply
  };
}

function printCaseResult(caseResult) {
  const status = caseResult.pass ? 'PASS' : 'FAIL';
  console.log(`\n[${status}] ${caseResult.type} :: ${caseResult.caseName}`);
  console.log(`Prompt: ${caseResult.prompt}`);
  console.log(`Latency: ${caseResult.latencyMs}ms`);
  console.log(`Reasons: ${JSON.stringify(caseResult.reasons)}`);
  console.log(`Reply: ${caseResult.reply}`);
}

function summarize(results) {
  const offTopic = results.filter((entry) => entry.type === 'off-topic');
  const inDomain = results.filter((entry) => entry.type === 'in-domain');

  const offTopicPasses = offTopic.filter((entry) => entry.pass).length;
  const inDomainPasses = inDomain.filter((entry) => entry.pass).length;
  const avgLatency = Math.round(results.reduce((sum, entry) => sum + entry.latencyMs, 0) / Math.max(results.length, 1));

  const gates = {
    offTopicGate: offTopicPasses >= offTopic.length,
    inDomainGate: inDomainPasses >= Math.ceil(inDomain.length * 0.67),
    latencyGate: avgLatency <= 8000
  };

  const overallPass = Object.values(gates).every(Boolean);

  return {
    overallPass,
    gates,
    totals: {
      offTopic: `${offTopicPasses}/${offTopic.length}`,
      inDomain: `${inDomainPasses}/${inDomain.length}`,
      avgLatencyMs: avgLatency
    }
  };
}

async function main() {
  console.log(`Running LLM validation probe against ${DEFAULT_ENDPOINT}`);

  const results = [];
  for (const testCase of offTopicCases) {
    results.push(await runOffTopicCase(testCase));
  }

  for (const testCase of inDomainCases) {
    results.push(await runInDomainCase(testCase));
  }

  results.forEach(printCaseResult);
  const summary = summarize(results);

  console.log('\nValidation Summary');
  console.log(JSON.stringify(summary, null, 2));

  process.exit(summary.overallPass ? 0 : 1);
}

main().catch((error) => {
  console.error('Validation probe crashed:', error);
  process.exit(2);
});