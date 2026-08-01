const http = require('http');
const fs = require('fs');
const path = require('path');
const { fetchGoogleSheetData, formatSheetRowsForPrompt } = require('./sheetService');

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

async function handleChat(req, res) {
  try {
    const body = await readBody(req);
    const message = body.message || '';

    if (!message.trim()) {
      sendJson(res, 400, { error: 'A message is required.' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY;
    if (!apiKey) {
      sendJson(res, 500, {
        error: 'Anthropic API key is not configured.'
      });
      return;
    }

    const sheetUrl = process.env.GOOGLE_SHEET_URL || body.sheetUrl || '';
    let sheetContext = '';

    if (sheetUrl) {
      try {
        const rows = await fetchGoogleSheetData(sheetUrl);
        sheetContext = formatSheetRowsForPrompt(rows, 25);
      } catch (error) {
        console.error('Failed to fetch sheet data', error);
      }
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
      sendJson(res, response.status, { error: 'Anthropic request failed', detail: errorText });
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
