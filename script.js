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
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userText })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Unable to reach model service.');
    }

    const data = await response.json();
    return data.reply || 'I am unable to respond right now.';
  } catch (error) {
    return `I hit a connection issue while contacting Claude: ${error.message}`;
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
