const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const quickButtons = document.querySelectorAll('.quick-btn');

const greeting = {
  role: 'bot',
  text: 'Hello! I am Claude, your Rockwell support assistant. I can help with surveys, engineering support, pricing, delivery timelines, and how to contact the team.'
};

function addMessage(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `message ${role}`;
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function generateResponse(userText) {
  if (!userText.trim()) {
    return 'Please tell me what you need help with.';
  }

  try {
    const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.0/dist/transformers.min.js');
    const generator = await pipeline('text-generation', 'Xenova/distilgpt2');
    const output = await generator(`Rockwell support: ${userText}`, { max_new_tokens: 40, temperature: 0.8 });
    const text = output[0]?.generated_text?.replace(`Rockwell support: ${userText}`, '').trim();
    return text || 'I can help with project scope, site surveys, engineering support, quotes, delivery timing, and contact details.';
  } catch (error) {
    return `I hit a connection issue while loading the model: ${error.message}`;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const userText = messageInput.value.trim();
  if (!userText) return;

  addMessage('user', userText);
  messageInput.value = '';
  addMessage('bot', 'Thinking…');

  const response = await generateResponse(userText);
  chatMessages.removeChild(chatMessages.lastChild);
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
