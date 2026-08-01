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

module.exports = {
  normalizeGoogleSheetUrl,
  parseGoogleSheetPayload,
  formatSheetRowsForPrompt,
  fetchGoogleSheetData
};
