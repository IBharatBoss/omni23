// src/core/scroll-lock.js
/**
 * Gold-Standard Mobile & Desktop Background Scroll Lock
 * Completely freezes background scrolling and touch movement without losing scroll position.
 */
let scrollPosition = 0;
let lockCount = 0;

export function lockBackgroundScroll() {
  if (lockCount === 0) {
    scrollPosition = window.pageYOffset || document.documentElement.scrollTop || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollPosition}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
  }
  lockCount++;
}

export function unlockBackgroundScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    document.body.classList.remove('modal-open');
    window.scrollTo(0, scrollPosition);
  }
}
