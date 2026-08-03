let https = null;
if (typeof require === 'function') {
  try {
    https = require('https');
  } catch (error) {
    https = null;
  }
}

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

  if (Array.isArray(payload)) {
    return payload.filter((row) => row && typeof row === 'object');
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

function parseNumericValue(value) {
  if (value == null) {
    return null;
  }

  const normalized = String(value).replace(/[^0-9.-]+/g, '');
  if (!normalized) {
    return null;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function getRowServiceName(row) {
  if (!row || typeof row !== 'object') {
    return 'Unknown service';
  }

  return row.service_name || row.Service || row['service name'] || row.service || 'Unknown service';
}

function getRowFee(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  return parseNumericValue(row.fee_eur || row.price || row.cost || row.Fee || row.Price || row.Cost);
}

function getRowSlots(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }

  return parseNumericValue(row.slots_this_week || row.slots || row.availability_slots || row.AvailabilitySlots);
}

function isImplausibleFee(fee, medianFee) {
  if (fee == null || fee <= 0) {
    return false;
  }

  if (fee >= 100000) {
    return true;
  }

  if (medianFee == null || medianFee <= 0) {
    return fee > 5000;
  }

  return fee > 5000 || fee >= medianFee * 10;
}

function asksForSheetAnomalies(message) {
  return /implausible|absurd|anomal|outlier|suspicious|bad data|data issue|data quality|wrong value|invalid value|zero availability|availability issue/.test(String(message || '').toLowerCase());
}

function detectSheetAnomalies(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const fees = rows
    .map((row) => getRowFee(row))
    .filter((value) => value != null && value > 0)
    .sort((left, right) => left - right);

  const medianFee = fees.length === 0
    ? null
    : fees[Math.floor(fees.length / 2)];

  return rows.flatMap((row) => {
    const anomalies = [];
    const serviceName = getRowServiceName(row);
    const fee = getRowFee(row);
    const slots = getRowSlots(row);
    const availability = String(row?.availability || row?.Availability || '').trim().toLowerCase();

    if (isImplausibleFee(fee, medianFee)) {
      anomalies.push({
        type: 'implausible_price',
        serviceName,
        field: row.fee_eur != null ? 'fee_eur' : row.price != null ? 'price' : 'cost',
        value: fee,
        message: `${serviceName} has an implausible price of ${fee} EUR.`
      });
    }

    if (
      slots != null && slots <= 0
      || ['0', 'zero', 'none', 'unavailable', 'no availability', 'fully booked', 'sold out'].includes(availability)
    ) {
      anomalies.push({
        type: 'zero_availability',
        serviceName,
        field: slots != null ? 'slots_this_week' : 'availability',
        value: slots != null ? slots : availability,
        message: `${serviceName} has zero availability right now.`
      });
    }

    return anomalies;
  });
}

function formatSheetAnomalies(rows) {
  const anomalies = detectSheetAnomalies(rows);
  if (anomalies.length === 0) {
    return 'No implausible prices or zero-availability items were found in the current sheet data.';
  }

  return anomalies.map((anomaly) => anomaly.message).join(' ');
}

function buildSheetAnomalyAnswer(message, rows) {
  if (!asksForSheetAnomalies(message)) {
    return null;
  }

  return formatSheetAnomalies(rows);
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

  const anomalyAnswer = buildSheetAnomalyAnswer(message, rows);
  if (anomalyAnswer) {
    return anomalyAnswer;
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

function addNoCacheParam(url) {
  if (!url) {
    return url;
  }

  try {
    const parsed = new URL(url);
    parsed.searchParams.set('_', String(Date.now()));
    return parsed.toString();
  } catch (error) {
    return url;
  }
}

function fetchGoogleSheetData(sheetUrl) {
  return new Promise((resolve, reject) => {
    const normalizedUrl = addNoCacheParam(normalizeGoogleSheetUrl(sheetUrl));

    if (typeof window !== 'undefined' && typeof fetch === 'function') {
      const timeoutId = setTimeout(() => reject(new Error('Google Sheet request timed out')), 15000);

      fetch(normalizedUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        },
        cache: 'no-store'
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Google Sheet request failed with status ${response.status}`);
          }
          return response.text();
        })
        .then((body) => {
          clearTimeout(timeoutId);
          try {
            resolve(parseGoogleSheetPayload(body));
          } catch (error) {
            reject(new Error(`Unable to parse Google Sheet response: ${error.message}`));
          }
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          if (sheetUrl && typeof sheetUrl === 'string' && sheetUrl.startsWith('/')) {
            fetch(sheetUrl)
              .then((response) => {
                if (!response.ok) {
                  throw new Error(`Local sheet data request failed with status ${response.status}`);
                }
                return response.json();
              })
              .then((payload) => resolve(parseGoogleSheetPayload(payload)))
              .catch((fallbackError) => reject(fallbackError));
            return;
          }
          reject(error);
        });
      return;
    }

    if (!https) {
      reject(new Error('HTTPS module unavailable in this environment'));
      return;
    }

    const request = https.get(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
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
  asksForSheetAnomalies,
  detectSheetAnomalies,
  formatSheetAnomalies,
  isImplausibleFee,
  findBestSheetMatch,
  buildSheetAnswer,
  buildSheetReply,
  addNoCacheParam,
  fetchGoogleSheetData
};

if (typeof window !== 'undefined') {
  window.rockwellSheetService = exportedApi;
}

if (typeof globalThis !== 'undefined') {
  globalThis.rockwellSheetService = exportedApi;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportedApi;
}

if (typeof window !== 'undefined') {
  window.rockwellSheetService = exportedApi;
}
