const http = require('http');
const fs = require('fs');
const path = require('path');
const { fetchGoogleSheetData, formatSheetRowsForPrompt, findBestSheetMatch, buildSheetAnswer, buildSheetReply } = require('./sheetService');
const { detectWeatherIntent, buildWeatherReply } = require('./weatherService');

const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1BbEbzqca1-0A51c5ZJFm6An9XCB8z0fdt4w5T17cH2M/edit?usp=sharing';

const port = process.env.PORT || 3000;
const rootDir = __dirname;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = mimeTypes[ext] || 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
}

function getRequestPath(url) {
  const parsed = new URL(url, `http://${process.env.HOST || 'localhost'}`);
  return parsed.pathname;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function buildServiceSnapshotForMessage(message, rows) {
  const match = findBestSheetMatch(rows, message);
  if (!match) {
    return '';
  }

  const serviceName = match.service_name || match.Service || match['service name'] || 'Selected service';
  const fee = match.fee_eur || match.price || match.cost || 'N/A';
  const slots = match.slots_this_week || match.slots || 'N/A';
  const availability = match.availability || match.Availability || 'N/A';

  return `Service details from live sheet: ${serviceName}. Fee: ${fee} EUR. Slots this week: ${slots}. Availability: ${availability}.`;
}

async function handleChat(req, res) {
  try {
    const body = await readBody(req);
    const message = body.message || '';

    if (!message.trim()) {
      sendJson(res, 400, { error: 'A message is required.' });
      return;
    }

    const sheetUrl = process.env.GOOGLE_SHEET_URL || body.sheetUrl || DEFAULT_SHEET_URL;
    let rows = [];
    let sheetContext = '';
    let weatherError = null;

    if (sheetUrl) {
      try {
        rows = await fetchGoogleSheetData(sheetUrl);
        sheetContext = formatSheetRowsForPrompt(rows, 25);
      } catch (error) {
        console.error('Failed to fetch sheet data', error);
      }
    }

    try {
      const weatherReply = await buildWeatherReply(message, rows);
      if (weatherReply) {
        const serviceSnapshot = buildServiceSnapshotForMessage(message, rows);
        const combinedReply = serviceSnapshot ? `${serviceSnapshot} ${weatherReply}` : weatherReply;
        sendJson(res, 200, { reply: combinedReply });
        return;
      }
    } catch (error) {
      weatherError = error;
      console.error('Failed to fetch weather data', error);
    }

    if (weatherError && detectWeatherIntent(message)) {
      const serviceSnapshot = buildServiceSnapshotForMessage(message, rows);
      const fallback = serviceSnapshot
        ? `${serviceSnapshot} Live weather is temporarily unavailable right now, so please proceed with normal site safety checks or retry in a few minutes for a weather-assisted recommendation.`
        : 'Live weather is temporarily unavailable right now. Please retry in a few minutes and I can combine weather with service availability for a safer scheduling recommendation.';
      sendJson(res, 200, { reply: fallback });
      return;
    }

    const sheetAnswer = buildSheetAnswer(message, rows);
    if (sheetAnswer) {
      sendJson(res, 200, { reply: sheetAnswer });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY;
    if (!apiKey) {
      const reply = buildSheetReply(message, rows);
      sendJson(res, 200, { reply });
      return;
    }

    const prompt = [
      'You are Claude, a helpful customer support assistant for Rockwell Site Surveys Engineering.',
      'Answer using the live Google Sheet data provided below at the time of the question.',
      'If the sheet data does not contain the answer, say that you cannot confirm it from the current data and avoid inventing details.',
      'Keep answers concise, professional, and grounded in the company\'s business.',
      'If a prompt is unrelated to support, politely redirect back to support needs.',
      '',
      'Live sheet data:',
      sheetContext || 'No live sheet data was available.'
    ].join('\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 400,
        system: prompt,
        messages: [{ role: 'user', content: message }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      const fallbackReply = buildSheetReply(message, rows);
      sendJson(res, 200, { reply: fallbackReply, error: 'Anthropic request failed', detail: errorText });
      return;
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || 'I am unable to respond right now.';
    sendJson(res, 200, { reply });
  } catch (error) {
    sendJson(res, 500, { error: 'Failed to process chat request', detail: error.message });
  }
}

const server = http.createServer(async (req, res) => {
  const pathname = getRequestPath(req.url);

  if (req.method === 'GET' && pathname === '/healthz') {
    sendJson(res, 200, { status: 'ok' });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/chat') {
    await handleChat(req, res);
    return;
  }

  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    sendJson(res, 403, { error: 'Invalid path' });
    return;
  }

  serveFile(res, filePath);
});

server.listen(port, () => {
  console.log(`Rockwell support chat server listening on http://localhost:${port}`);
});
