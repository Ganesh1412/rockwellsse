const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const quickButtons = document.querySelectorAll('.quick-btn');
const backendUrl = '/api/chat';

const greeting = {
  role: 'bot',
  text: 'Hello! I am Claude, your Rockwell support assistant. I can help with surveys, engineering support, pricing, delivery timelines, and how to contact the team.'
};

const fallbackResponses = {
  default: 'I can help with project scope, site surveys, engineering support, quotes, delivery timing, and contact details. Tell me what you need and I will help you right away.',
  service: 'Rockwell Site Surveys Engineering provides site survey planning, engineering support, technical documentation, and project coordination for clients needing dependable field and design assistance.',
  quote: 'Quotes are prepared based on survey scope, site complexity, distance, and required turnaround. Send your project details and preferred timeline, and we will return a clear estimate within one business day.',
  timeline: 'Standard projects usually move through planning and delivery within 3 to 7 business days, while more detailed engineering packages may take longer.',
  contact: 'You can contact the support team at support@rockwellsse.com or call +1 (555) 010-2040.',
  order: 'If you need help with an order or invoice, send the project reference and we will guide you through next steps.'
};

function addMessage(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `message ${role}`;
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function fetchBackendResponse(userText) {
  try {
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: userText })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.reply || null;
  } catch (error) {
    return null;
  }
}

function generateResponse(userText) {
  const normalized = userText.toLowerCase();

  if (!normalized.trim()) {
    return 'Please tell me what you need help with.';
  }

  if (normalized.includes('service') || normalized.includes('survey') || normalized.includes('engineering') || normalized.includes('design') || normalized.includes('planning')) {
    return fallbackResponses.service;
  }

  if (normalized.includes('quote') || normalized.includes('price') || normalized.includes('estimate') || normalized.includes('cost') || normalized.includes('proposal')) {
    return fallbackResponses.quote;
  }

  if (normalized.includes('timeline') || normalized.includes('deliver') || normalized.includes('days') || normalized.includes('schedule') || normalized.includes('lead time') || normalized.includes('shipping')) {
    return fallbackResponses.timeline;
  }

  if (normalized.includes('contact') || normalized.includes('support') || normalized.includes('email') || normalized.includes('phone') || normalized.includes('reach')) {
    return fallbackResponses.contact;
  }

  if (normalized.includes('order') || normalized.includes('invoice') || normalized.includes('bill') || normalized.includes('purchase')) {
    return fallbackResponses.order;
  }

  return fallbackResponses.default;
}

async function handleSubmit(event) {
  event.preventDefault();
  const userText = messageInput.value.trim();
  if (!userText) return;

  addMessage('user', userText);
  messageInput.value = '';
  addMessage('bot', 'Thinking…');

  const backendReply = await fetchBackendResponse(userText);
  const response = backendReply || generateResponse(userText);

  const lastBubble = chatMessages.lastChild;
  if (lastBubble && lastBubble.classList.contains('bot') && lastBubble.textContent === 'Thinking…') {
    chatMessages.removeChild(lastBubble);
  }

  addMessage('bot', response);
}

quickButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const prompt = button.dataset.prompt;
    messageInput.value = prompt;
    messageInput.focus();
  });
});

chatForm.addEventListener('submit', handleSubmit);

addMessage('bot', greeting.text);
