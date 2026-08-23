// src/ui/home-view.js
import { registry } from '../engine/registry.js';
import { bus } from '../core/bus.js';
import { state } from '../core/state.js';

// Tactile 2x3 Color-Block Palette Map
const DEFAULT_CLASSES = ['tile-yellow', 'tile-purple', 'tile-turquoise', 'tile-pink', 'tile-peach', 'tile-cyan', 'tile-amber', 'tile-lime'];

let typewriterTimer = null;

/**
 * Decoupled Home View Component
 * Frosted Liquid Glass Search Pill with Typewriter Effect, Value Copy, Trust Marks, and Tactile Tiles.
 */
export function renderHomeView() {
  const container = document.getElementById('home-view');
  if (!container) return;

  if (typewriterTimer) clearTimeout(typewriterTimer);

  container.innerHTML = '';
  container.className = 'animate-fade-in';

  let currentCategory = state.get('activeCategory') || 'All';

  // 1. High-Impact Hero Section with Verified Badge & Value Copy
  const hero = document.createElement('section');
  hero.className = 'hero-section';

  hero.innerHTML = `
    <div class="hero-badge">
      <span class="badge-dot"></span>
      <span class="badge-text">🛡️ Verified 100% Client-Side • Zero Cloud Uploads • End-to-End Private</span>
    </div>
    
    <h1 class="hero-title">
      Ultra-Fast File Tools.<br>
      <span class="hero-gradient-text">Zero Servers. Zero Limits.</span>
    </h1>
    
    <p class="hero-subtitle">
      Convert, compress, and edit Images, PDFs & Vectors directly in your browser with instant WebAssembly speed.
      No file size restrictions, no sign-ups, and your data never touches the cloud.
    </p>

    <!-- Frosted Apple Liquid Glass Search Trigger Pill -->
    <div class="home-search-container">
      <div class="hero-search-trigger" id="hero-search-btn">
        <div class="hero-search-placeholder">
          <span class="search-glass-icon">🔍</span>
          <div class="typewriter-wrapper">
            <span id="typewriter-text" class="typewriter-text"></span>
            <span class="typewriter-cursor">|</span>
          </div>
        </div>
        <span class="kbd-badge">⌘K</span>
      </div>

      <!-- Quick Action Trending Chips -->
      <div class="quick-chips-row">
        <span class="quick-chips-label">Popular:</span>
        <button class="quick-chip" data-tool-id="img-compress">🔥 Compress Image</button>
        <button class="quick-chip" data-tool-id="img-resize">📐 Resize Image</button>
        <button class="quick-chip" data-tool-id="pdf-merge">📄 Merge PDF</button>
        <button class="quick-chip" data-tool-id="pdf-split">✂️ Split PDF</button>
        <button class="quick-chip" data-tool-id="img-converter">✨ Convert Image</button>
      </div>
    </div>
  `;

  container.appendChild(hero);

  // Start Live Typewriter Animation on search placeholder
  const typewriterEl = hero.querySelector('#typewriter-text');
  startTypewriterAnimation(typewriterEl);

  // Bind Search Popup Trigger
  const searchTrigger = hero.querySelector('#hero-search-btn');
  if (searchTrigger) {
    searchTrigger.addEventListener('click', () => {
      bus.emit('commandbar:open');
    });
  }

  // Bind Quick Action Chips
  hero.querySelectorAll('.quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const toolId = chip.dataset.toolId;
      if (toolId) bus.emit('route:navigate', toolId);
    });
  });

  // 2. Trust & Security Verified Mark Banner
  const trustBanner = document.createElement('div');
  trustBanner.className = 'trust-banner';
  trustBanner.innerHTML = `
    <div class="trust-item">
      <div class="trust-icon">⚡</div>
      <div class="trust-info">
        <span class="trust-title">On-Device Processing</span>
        <span class="trust-desc">Native WebAssembly & WebGPU</span>
      </div>
    </div>
    
    <div class="trust-divider"></div>

    <div class="trust-item">
      <div class="trust-icon">🔒</div>
      <div class="trust-info">
        <span class="trust-title">100% Data Privacy</span>
        <span class="trust-desc">Zero file uploads to external servers</span>
      </div>
    </div>

    <div class="trust-divider"></div>

    <div class="trust-item">
      <div class="trust-icon">🛡️</div>
      <div class="trust-info">
        <span class="trust-title">Zero File Size Limits</span>
        <span class="trust-desc">Unlimited batch conversions free forever</span>
      </div>
    </div>
  `;

  container.appendChild(trustBanner);

  // 3. Category Filter Row
  const categoryBar = document.createElement('div');
  categoryBar.className = 'category-filter-bar';

  const categories = registry.getCategories();

  categories.forEach(cat => {
    const pill = document.createElement('button');
    pill.className = `category-pill ${cat === currentCategory ? 'active' : ''}`;
    pill.textContent = cat;

    pill.addEventListener('click', () => {
      currentCategory = cat;
      state.set('activeCategory', cat);

      categoryBar.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      renderToolsGrid(gridContainer, cat);
    });

    categoryBar.appendChild(pill);
  });

  container.appendChild(categoryBar);

  // 4. 2x3 Color-Block Grid (Tactile Anti-Gravity Tiles)
  const gridContainer = document.createElement('div');
  gridContainer.className = 'tools-grid';
  container.appendChild(gridContainer);

  // Initial Grid Render
  renderToolsGrid(gridContainer, currentCategory);
}

function renderToolsGrid(gridContainer, category = 'All') {
  gridContainer.innerHTML = '';
  const tools = registry.getToolsByCategory(category);

  if (tools.length === 0) {
    gridContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);">
        <p>No tools found in this category.</p>
      </div>
    `;
    return;
  }

  tools.forEach((tool) => {
    // Deterministic hash based on Tool ID to pick a consistent color
    let hash = 0;
    for (let i = 0; i < tool.id.length; i++) {
      hash = tool.id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorIndex = Math.abs(hash) % DEFAULT_CLASSES.length;
    const tileClass = DEFAULT_CLASSES[colorIndex];

    const tile = document.createElement('div');
    tile.className = `tactile-tile ${tileClass} animate-fade-in`;
    tile.dataset.toolId = tool.id;

    tile.innerHTML = `
      <div class="tile-icon-box">
        <span class="tile-icon">${tool.icon || '⚡'}</span>
      </div>
      <div class="tile-content">
        <div class="tile-header">
          <span class="tile-title">${tool.title}</span>
          <span class="tile-category-tag">${tool.category}</span>
        </div>
        <span class="tile-desc">${tool.description}</span>
      </div>
      <div class="tile-action-arrow">→</div>
    `;

    tile.addEventListener('click', () => {
      bus.emit('route:navigate', tool.id);
    });

    gridContainer.appendChild(tile);
  });
}

/**
 * Typewriter Animation for Search Bar Placeholder
 */
function startTypewriterAnimation(targetEl) {
  if (!targetEl) return;
  if (typewriterTimer) clearTimeout(typewriterTimer);

  const phrases = [
    "Search 'compress image'...",
    "Search 'resize image'...",
    "Search 'merge pdf'...",
    "Search 'convert to webp'...",
    "Search 'split pdf'...",
    "Search 'svg to png'...",
    "Ask AI: 'how to reduce pdf size?'...",
    "Search all local tools (⌘K)..."
  ];

  let phraseIndex = 0;
  let charIndex = 0;
  let isDeleting = false;

  function typeStep() {
    const currentPhrase = phrases[phraseIndex];

    requestAnimationFrame(() => {
      if (isDeleting) {
        targetEl.textContent = currentPhrase.substring(0, charIndex - 1);
        charIndex--;
      } else {
        targetEl.textContent = currentPhrase.substring(0, charIndex + 1);
        charIndex++;
      }
    });

    let delay = isDeleting ? 32 : 65;

    if (!isDeleting && charIndex === currentPhrase.length) {
      delay = 1800; // Pause at end of sentence
      isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
      isDeleting = false;
      phraseIndex = (phraseIndex + 1) % phrases.length;
      delay = 400; // Pause before typing next sentence
    }

    if (document.body.contains(targetEl)) {
      typewriterTimer = setTimeout(typeStep, delay);
    }
  }

  typeStep();
}
