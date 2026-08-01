const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const quickButtons = document.querySelectorAll('.quick-btn');

const greeting = {
  role: 'bot',
  text: 'Hello! I am Claude, your Rockwell support assistant. I can help with surveys, engineering support, pricing, delivery timelines, and how to contact the team.'
};

const knowledgeBase = [
  {
    keywords: ['service', 'offer', 'survey', 'engineering', 'design'],
    response:
      'Rockwell Site Surveys Engineering provides site survey planning, engineering support, technical documentation, and project coordination for clients needing dependable field and design assistance. We tailor every engagement to the scope, location, and urgency of the work.'
  },
  {
    keywords: ['quote', 'price', 'cost', 'budget', 'estimate'],
    response:
      'Quotes are prepared based on survey scope, site complexity, distance, and required turnaround. Send your project details and preferred timeline, and we will return a clear estimate within one business day.'
  },
  {
    keywords: ['timeline', 'deliver', 'turnaround', 'days', 'schedule', 'when'],
    response:
      'Standard projects usually move through planning and delivery within 3 to 7 business days, while more detailed engineering packages may take longer. We can usually confirm timing once the scope is reviewed.'
  },
  {
    keywords: ['contact', 'support', 'reach', 'phone', 'email', 'help'],
    response:
      'You can contact the support team at support@rockwellsse.com or call +1 (555) 010-2040. We are happy to help with onboarding, scheduling, and service questions.'
  },
  {
    keywords: ['payment', 'invoice', 'bill', 'purchase', 'order'],
    response:
      'Invoices are issued after project confirmation and can be handled through approved billing channels. If you need help with an order or invoice, send the project reference and we will guide you through next steps.'
  },
  {
    keywords: ['problem', 'issue', 'broken', 'delay', 'complaint'],
    response:
      'We are sorry to hear about the issue. Please share the project name, the service involved, and a short summary of the problem so we can escalate it quickly and keep you updated.'
  }
];

function addMessage(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `message ${role}`;
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function generateResponse(userText) {
  const normalized = userText.toLowerCase();

  if (!normalized.trim()) {
    return 'Please tell me what you need help with.';
  }

  if (['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'].some((v) => normalized.includes(v))) {
    return greeting.text;
  }

  for (const item of knowledgeBase) {
    if (item.keywords.some((keyword) => normalized.includes(keyword))) {
      return item.response;
    }
  }

  return 'I can help with project scope, site surveys, engineering support, quotes, delivery timing, and contact details. Tell me what you need and I will help you right away.';
}

function handleSubmit(event) {
  event.preventDefault();
  const userText = messageInput.value.trim();
  if (!userText) return;

  addMessage('user', userText);
  messageInput.value = '';

  const response = generateResponse(userText);
  setTimeout(() => addMessage('bot', response), 350);
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
