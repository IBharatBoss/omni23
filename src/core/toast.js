// src/core/toast.js
/**
 * Lightweight, non-blocking Toast Notification System.
 * Replaces blocking window.alert() and window.confirm().
 */
export const toast = {
  show(message, type = 'info', duration = 3000) {
    let container = document.getElementById('omni-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'omni-toast-container';
      container.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: none;
      `;
      document.body.appendChild(container);
    }

    const toastEl = document.createElement('div');
    toastEl.className = 'animate-fade-in';
    
    let bg = 'rgba(23, 107, 116, 0.9)'; // Teal (info/success)
    let icon = 'ℹ️';
    if (type === 'error') {
      bg = 'rgba(197, 48, 48, 0.95)';
      icon = '❌';
    } else if (type === 'warning') {
      bg = 'rgba(217, 119, 6, 0.95)';
      icon = '⚠️';
    } else if (type === 'success') {
      bg = 'rgba(27, 138, 90, 0.95)';
      icon = '✅';
    }

    toastEl.style.cssText = `
      background: ${bg};
      color: #fff;
      padding: 12px 20px;
      border-radius: var(--radius-md, 12px);
      font-size: 0.95rem;
      font-weight: 500;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      gap: 10px;
      pointer-events: auto;
      transition: opacity 0.3s ease, transform 0.3s ease;
    `;

    toastEl.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toastEl);

    setTimeout(() => {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateY(10px)';
      setTimeout(() => toastEl.remove(), 300);
    }, duration);
  }
};
