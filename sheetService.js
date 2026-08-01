const https = require('https');

function normalizeGoogleSheetUrl(sheetUrl) {
  if (!sheetUrl) {
    return '';
  }

  try {
    const parsed = new URL(sheetUrl);
    const match = parsed.pathname.match(/\/spreadsheets(?:\/u\/\d+)?\/d\/([^/]+)/i);
    if (match && match[1]) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:json`;
    }
  } catch (error) {
    return sheetUrl;
  }

  return sheetUrl;
}

function parseGoogleSheetPayload(payload) {
  if (!payload) {
    return [];
  }

  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    const wrappedMatch = trimmed.match(/google\.visualization\.Query\.setResponse\((.*)\)\s*;?\s*$/s);
    if (wrappedMatch) {
      try {
        return parseGoogleSheetPayload(JSON.parse(wrappedMatch[1]));
      } catch (error) {
        return [];
      }
    }

    try {
      return parseGoogleSheetPayload(JSON.parse(trimmed));
    } catch (error) {
      return [];
    }
  }

  if (!payload.table || !Array.isArray(payload.table.rows)) {
    return [];
  }

  const columns = Array.isArray(payload.table.cols) ? payload.table.cols : [];
  return payload.table.rows
    .map((row) => {
      if (!row || !Array.isArray(row.c)) {
        return null;
      }

      const values = row.c.reduce((acc, cell, index) => {
        const label = columns[index]?.label || `Column${index + 1}`;
        const value = cell && typeof cell === 'object' && 'v' in cell ? cell.v : cell;
        acc[label] = value == null ? '' : String(value);
        return acc;
      }, {});

      return Object.keys(values).length > 0 ? values : null;
    })
    .filter(Boolean);
}

function formatSheetRowsForPrompt(rows, maxRows = 20) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return '';
  }

  const selected = rows.slice(0, maxRows);
  return selected
    .map((row, index) => {
      const entries = Object.entries(row)
        .map(([key, value]) => `${key}: ${value}`)
        .join(' | ');
      return `${index + 1}. ${entries}`;
    })
    .join('\n');
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findBestSheetMatch(rows, message) {
  if (!Array.isArray(rows) || rows.length === 0 || !message || !message.trim()) {
    return null;
  }

  const normalizedMessage = normalizeText(message);
  const messageTokens = new Set(normalizedMessage.split(/\s+/).filter(Boolean));

  const scored = rows
    .map((row) => {
      const rowText = Object.values(row)
        .filter((value) => value != null && String(value).trim())
        .map((value) => normalizeText(value))
        .join(' ');
      const rowTokens = new Set(rowText.split(/\s+/).filter(Boolean));
      const overlap = [...messageTokens].filter((token) => rowTokens.has(token)).length;
      const serviceName = normalizeText(row.service_name || row.Service || row['service name'] || '');
      const serviceNameTokens = new Set(serviceName.split(/\s+/).filter(Boolean));
      const serviceNameOverlap = [...messageTokens].filter((token) => serviceNameTokens.has(token)).length;
      const score = overlap + serviceNameOverlap;
      return { row, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return scored[0]?.row || null;
}

function buildSheetAnswer(message, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  const normalizedMessage = normalizeText(message);
  const asksForServices = /service|services|offer|offerings|what do you offer|what services/i.test(message);
  const asksForPrice = /price|cost|fee|how much|pricing|quote/i.test(message);

  if (asksForServices) {
    const names = rows
      .map((row) => row.service_name || row.Service || row['service name'] || '')
      .filter(Boolean)
      .slice(0, 6);
    return `We offer: ${names.join(', ')}.`;
  }

  const directMatch = findBestSheetMatch(rows, message);
  if (!directMatch) {
    return null;
  }

  if (asksForPrice) {
    const fee = directMatch.fee_eur || directMatch.price || directMatch.cost || '';
    if (fee) {
      return `${directMatch.service_name || directMatch.Service || directMatch['service name']} costs ${fee} EUR.`;
    }
  }

  const details = Object.entries(directMatch)
    .filter(([key]) => !['service_id'].includes(key.toLowerCase()))
    .map(([key, value]) => `${key}: ${value}`)
    .join(' | ');

  return details || null;
}

function buildSheetReply(message, rows) {
  const answer = buildSheetAnswer(message, rows);
  if (answer) {
    return answer;
  }

  return 'I can help with surveys, engineering support, pricing, delivery timelines, and contact details. Tell me what you need and I will help you right away.';
}

function fetchGoogleSheetData(sheetUrl) {
  return new Promise((resolve, reject) => {
    const normalizedUrl = normalizeGoogleSheetUrl(sheetUrl);
    const request = https.get(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    }, (response) => {
      const chunks = [];

      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');

        if (response.statusCode && response.statusCode >= 400) {
          reject(new Error(`Google Sheet request failed with status ${response.statusCode}`));
          return;
        }

        try {
          resolve(parseGoogleSheetPayload(body));
        } catch (error) {
          reject(new Error(`Unable to parse Google Sheet response: ${error.message}`));
        }
      });
    });

    request.on('error', reject);
  });
}

const exportedApi = {
  normalizeGoogleSheetUrl,
  parseGoogleSheetPayload,
  formatSheetRowsForPrompt,
  findBestSheetMatch,
  buildSheetAnswer,
  buildSheetReply,
  fetchGoogleSheetData
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportedApi;
}

if (typeof window !== 'undefined') {
  window.rockwellSheetService = exportedApi;
}
