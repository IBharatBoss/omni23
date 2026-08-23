// src/ui/chat-copilot.js
import { bus } from '../core/bus.js';
import { askCopilot, isCopilotAvailable } from '../services/ai-copilot.js';
import { lockBackgroundScroll, unlockBackgroundScroll } from '../core/scroll-lock.js';

/**
 * Mobile-Responsive AI Copilot Modal Component
 * Renders rich clickable tool cards directly inside chat responses.
 */
export function initChatCopilot() {
  const overlay = document.getElementById('chat-overlay');
  const drawer = document.getElementById('chat-drawer');
  const closeBtn = document.getElementById('close-chat');
  const messages = document.getElementById('chat-messages');
  const statusEl = document.querySelector('.ai-status');
  const input = document.getElementById('chat-user-input');
  const sendBtn = document.getElementById('chat-send-btn');

  function open() {
    if (!overlay) return;
    overlay.classList.remove('hidden');
    lockBackgroundScroll();
    updateStatus();

    // Initial greeting if empty
    if (messages && messages.children.length === 0) {
      appendMessage({
        role: 'ai',
        text: 'Hello! I am your OmniTools AI Copilot. Ask me anything or type what you want to do (e.g. "png", "compress", "merge pdf").'
      });
    }

    if (input) {
      setTimeout(() => input.focus(), 80);
    }
  }

  function close() {
    if (overlay && !overlay.classList.contains('hidden')) {
      overlay.classList.add('hidden');
      unlockBackgroundScroll();
    }
  }

  function toggle() {
    if (overlay?.classList.contains('hidden')) {
      open();
    } else {
      close();
    }
  }

  // Exclusive close via cut (✕) button or escape key
  if (closeBtn) {
    closeBtn.addEventListener('click', close);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay && !overlay.classList.contains('hidden')) {
      close();
    }
  });

  // Event bus bindings
  bus.on('chat:open', open);
  bus.on('chat:toggle', toggle);
  bus.on('chat:close', close);

  // Send message handler (Always renders user input immediately)
  const handleSend = async () => {
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    
    input.value = '';
    
    // 1. Immediately render User Input in the chat list
    appendMessage({ role: 'user', text });

    // 2. Call AI Copilot to generate output
    await askCopilot(text);
  };

  if (sendBtn) sendBtn.addEventListener('click', handleSend);
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSend();
    });
  }

  bus.on('ai:message', (msg) => {
    appendMessage(msg);
  });

  function appendMessage(msg) {
    if (!messages) return;
    const { role, text, suggestedTools } = msg;

    const msgWrapper = document.createElement('div');
    msgWrapper.className = `chat-msg ${role} animate-fade-in`;

    const textEl = document.createElement('div');
    textEl.className = 'chat-msg-text';
    // Format bold markdown if any
    textEl.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    msgWrapper.appendChild(textEl);

    // If AI message contains clickable suggested tools, render rich interactive cards
    if (role === 'ai' && suggestedTools && suggestedTools.length > 0) {
      const toolsContainer = document.createElement('div');
      toolsContainer.className = 'chat-tool-cards';

      suggestedTools.forEach(tool => {
        const card = document.createElement('div');
        card.className = 'chat-tool-card';
        card.innerHTML = `
          <div class="chat-tool-icon">${tool.icon || '⚡'}</div>
          <div class="chat-tool-meta">
            <div class="chat-tool-title">${tool.title}</div>
            <div class="chat-tool-category">${tool.category}</div>
          </div>
          <button class="chat-tool-btn">Open →</button>
        `;

        card.addEventListener('click', () => {
          close();
          bus.emit('route:navigate', tool.id);
        });

        toolsContainer.appendChild(card);
      });

      msgWrapper.appendChild(toolsContainer);
    }

    messages.appendChild(msgWrapper);
    
    // Smooth auto-scroll to bottom
    setTimeout(() => {
      messages.scrollTop = messages.scrollHeight;
    }, 20);
  }

  function updateStatus() {
    if (!statusEl) return;
    if (isCopilotAvailable()) {
      statusEl.classList.remove('offline');
      statusEl.title = 'AI Copilot Online (Gemini AI)';
    } else {
      statusEl.classList.add('offline');
      statusEl.title = 'AI Copilot Smart Local Engine';
    }
  }

  bus.on('ai:status', updateStatus);

  // Visual Viewport Keyboard Handler for Mobile
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (overlay && !overlay.classList.contains('hidden') && drawer) {
        if (messages) messages.scrollTop = messages.scrollHeight;
      }
    });
  }
}
