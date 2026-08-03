function getLogWebhookUrl() {
  return process.env.GOOGLE_SHEET_LOG_WEBHOOK_URL || process.env.CHAT_LOG_SHEET_WEBHOOK_URL || '';
}

function getLogWebhookToken() {
  return process.env.GOOGLE_SHEET_LOG_WEBHOOK_TOKEN || '';
}

async function publishChatTranscript(event) {
  const webhookUrl = getLogWebhookUrl();
  if (!webhookUrl) {
    return false;
  }

  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable in this runtime');
  }

  const timeoutMs = Number(process.env.GOOGLE_SHEET_LOG_TIMEOUT_MS || 8000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const token = getLogWebhookToken();
  const headers = {
    'content-type': 'application/json'
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(event),
      signal: controller.signal,
      cache: 'no-store'
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Google Sheet log webhook failed with status ${response.status}: ${String(body || '').slice(0, 300)}`);
    }

    return true;
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  publishChatTranscript
};
