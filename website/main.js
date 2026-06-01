/* A2B Lift — main.js */

// ─── Shared backend-powered address suggestions ───────────────────────────
(function initSharedAddressAutocomplete() {
  const API = window.A2B_API_BASE || 'https://api.a2blift.com';
  const knownFields = [
    ['airportDestination', {}],
    ['ldFrom', { cityOnly: true }],
    ['ldTo', { cityOnly: true }],
    ['liftFrom', { cityOnly: true }],
    ['liftTo', { cityOnly: true }],
    ['ovFrom', { cityOnly: true }],
    ['ovTo', { cityOnly: true }],
    ['ldAvFrom', { cityOnly: true }],
    ['ldAvTo', { cityOnly: true }],
    ['ldTabFrom', { cityOnly: true }],
    ['ldTabTo', { cityOnly: true }],
    ['lcDashFrom', { cityOnly: true }],
    ['lcDashTo', { cityOnly: true }],
  ];

  function ensureAutocompleteStyles() {
    if (document.getElementById('a2b-autocomplete-styles')) return;
    const style = document.createElement('style');
    style.id = 'a2b-autocomplete-styles';
    style.textContent = `
      .a2b-autocomplete-wrap { position: relative; }
      .a2b-autocomplete-menu {
        position: absolute;
        left: 0;
        right: 0;
        top: calc(100% + 6px);
        z-index: 4000;
        display: none;
        max-height: 260px;
        overflow: auto;
        background: #fff;
        border: 1px solid rgba(0,0,0,.12);
        border-radius: 12px;
        box-shadow: 0 18px 48px rgba(0,0,0,.16);
        padding: 6px;
      }
      .a2b-autocomplete-menu.open { display: block; }
      .a2b-autocomplete-option {
        width: 100%;
        border: 0;
        background: transparent;
        color: #0a0a0a;
        display: block;
        text-align: left;
        border-radius: 8px;
        padding: 10px 12px;
        cursor: pointer;
      }
      .a2b-autocomplete-option:hover,
      .a2b-autocomplete-option.active { background: #f2f2f2; }
      .a2b-autocomplete-main { display: block; font-size: 14px; font-weight: 700; }
      .a2b-autocomplete-sub { display: block; margin-top: 2px; font-size: 12px; color: #666; line-height: 1.4; }
    `;
    document.head.appendChild(style);
  }

  function predictionValue(prediction) {
    return String(prediction?.description || prediction?.mainText || '').trim();
  }

  function predictionMain(prediction) {
    return String(prediction?.mainText || prediction?.description || '').trim();
  }

  function predictionSub(prediction) {
    return String(prediction?.secondaryText || '').trim();
  }

  function attachBackendAutocomplete(inputId, { cityOnly = false } = {}) {
    const input = document.getElementById(inputId);
    if (!input || input.dataset.a2bAutocompleteBound === '1') return;
    input.dataset.a2bAutocompleteBound = '1';
    ensureAutocompleteStyles();

    const parent = input.parentElement;
    if (parent && !parent.classList.contains('a2b-autocomplete-wrap')) {
      parent.classList.add('a2b-autocomplete-wrap');
    }

    const menu = document.createElement('div');
    menu.className = 'a2b-autocomplete-menu';
    menu.setAttribute('role', 'listbox');
    menu.id = `${inputId}AutocompleteMenu`;
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('aria-controls', menu.id);
    input.setAttribute('aria-expanded', 'false');
    (parent || input).appendChild(menu);

    let debounceTimer = null;
    let activeController = null;
    let activeIndex = -1;
    let suggestions = [];

    const closeMenu = () => {
      menu.classList.remove('open');
      input.setAttribute('aria-expanded', 'false');
      activeIndex = -1;
    };

    const choosePrediction = (prediction) => {
      const value = predictionValue(prediction);
      if (!value) return;
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      closeMenu();
    };

    const setActive = (index) => {
      const buttons = Array.from(menu.querySelectorAll('.a2b-autocomplete-option'));
      buttons.forEach((button, i) => button.classList.toggle('active', i === index));
      activeIndex = index;
    };

    const renderPredictions = (predictions) => {
      const seen = new Set();
      suggestions = predictions.filter((prediction) => {
        const value = predictionValue(prediction);
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 8);

      menu.innerHTML = suggestions.map((prediction, index) => {
        const main = predictionMain(prediction);
        const sub = predictionSub(prediction);
        return `
          <button type="button" class="a2b-autocomplete-option" role="option" data-index="${index}">
            <span class="a2b-autocomplete-main">${main.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]))}</span>
            ${sub ? `<span class="a2b-autocomplete-sub">${sub.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]))}</span>` : ''}
          </button>
        `;
      }).join('');

      if (!suggestions.length) {
        closeMenu();
        return;
      }
      menu.classList.add('open');
      input.setAttribute('aria-expanded', 'true');
    };

    input.addEventListener('input', () => {
      const query = input.value.trim();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (activeController) activeController.abort();

      if (query.length < 2) {
        suggestions = [];
        menu.innerHTML = '';
        closeMenu();
        return;
      }

      debounceTimer = setTimeout(async () => {
        activeController = new AbortController();
        try {
          const params = new URLSearchParams({ input: query });
          if (cityOnly) params.set('cityOnly', '1');
          const res = await fetch(`${API}/api/places/autocomplete?${params.toString()}`, {
            signal: activeController.signal,
          });
          if (!res.ok) {
            closeMenu();
            return;
          }
          const payload = await res.json();
          renderPredictions(Array.isArray(payload?.predictions) ? payload.predictions : []);
        } catch (error) {
          if (error?.name !== 'AbortError') closeMenu();
        }
      }, 220);
    });

    input.addEventListener('keydown', (event) => {
      if (!menu.classList.contains('open') || !suggestions.length) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((activeIndex + 1) % suggestions.length);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((activeIndex - 1 + suggestions.length) % suggestions.length);
      } else if (event.key === 'Enter' && activeIndex >= 0) {
        event.preventDefault();
        choosePrediction(suggestions[activeIndex]);
      } else if (event.key === 'Escape') {
        closeMenu();
      }
    });

    menu.addEventListener('mousedown', (event) => {
      const button = event.target.closest('.a2b-autocomplete-option');
      if (!button) return;
      event.preventDefault();
      choosePrediction(suggestions[Number(button.dataset.index)]);
    });

    document.addEventListener('click', (event) => {
      if (event.target === input || menu.contains(event.target)) return;
      closeMenu();
    });
  }

  window.A2BAddressAutocomplete = { attach: attachBackendAutocomplete };

  function bindKnownFields() {
    knownFields.forEach(([id, options]) => attachBackendAutocomplete(id, options));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindKnownFields);
  } else {
    bindKnownFields();
  }
  window.addEventListener('load', bindKnownFields);
})();

// ─── Nav auth state: show user name + logout on all pages ─────────────────
(function initNavAuth() {
  const token = localStorage.getItem('a2b_token');
  if (!token) return;
  let user = null;
  try { user = JSON.parse(localStorage.getItem('a2b_user') || 'null'); } catch(e) {}
  if (!user) return;

  const firstName = (user.name || user.username || '').split(' ')[0] || 'Account';
  const isDashboard = window.location.pathname.includes('dashboard.html');

  // Desktop nav-actions: replace "Log in" with user name (+ logout only on dashboard)
  const navActions = document.querySelector('.nav-actions');
  if (navActions) {
    const loginLink = navActions.querySelector('a[href="login.html"]');
    if (loginLink) {
      const replacement = isDashboard
        ? `<a href="dashboard.html" class="btn btn-ghost btn-sm">${firstName}</a><button class="btn btn-ghost btn-sm" onclick="(function(){localStorage.removeItem('a2b_token');localStorage.removeItem('a2b_user');window.location.href='index.html';})()">Log out</button>`
        : `<a href="dashboard.html" class="btn btn-ghost btn-sm">${firstName}</a>`;
      loginLink.outerHTML = replacement;
    }
  }

  // Mobile nav: same logic
  const mobileCta = document.querySelector('.mobile-cta');
  if (mobileCta) {
    const mobileLogin = mobileCta.querySelector('a[href="login.html"]');
    if (mobileLogin) {
      const replacement = isDashboard
        ? `<a href="dashboard.html" class="btn btn-ghost">${firstName}</a><button class="btn btn-primary" onclick="(function(){localStorage.removeItem('a2b_token');localStorage.removeItem('a2b_user');window.location.href='index.html';})()">Log out</button>`
        : `<a href="dashboard.html" class="btn btn-ghost">${firstName}</a>`;
      mobileLogin.outerHTML = replacement;
    }
  }
})();

// ─── Nav scroll shadow ────────────────────────────────────────────────────
const navEl = document.getElementById('nav');
if (navEl) {
  window.addEventListener('scroll', () => {
    navEl.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
}

// ─── Hamburger / mobile nav ───────────────────────────────────────────────
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobileNav');

if (hamburger && mobileNav) {
  hamburger.addEventListener('click', () => {
    const isOpen = mobileNav.classList.toggle('open');
    document.body.style.overflow = isOpen ? 'hidden' : '';
    hamburger.setAttribute('aria-expanded', String(isOpen));
  });

  // Close on any link click inside mobile nav
  mobileNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileNav.classList.remove('open');
      document.body.style.overflow = '';
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });
}

// ─── Fade-in on scroll ────────────────────────────────────────────────────
if ('IntersectionObserver' in window) {
  const fadeEls = document.querySelectorAll(
    '.service-card, .feature-card, .step-card, .earn-card, .route-card, ' +
    '.blog-card, .stat-item, .step, .split'
  );

  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        fadeObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  fadeEls.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    fadeObserver.observe(el);
  });
}

// ─── Smooth scroll for in-page hash links ────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const id = this.getAttribute('href').slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
