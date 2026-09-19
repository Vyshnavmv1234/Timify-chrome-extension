/**
 * motivationHud.js
 *
 * Renders the Timify in-page motivational HUD capsule inside a Shadow DOM.
 *
 * Visual design: Stitch "Obsidian Coral" — Sleek Minimal Floating Capsule HUD
 * Source of truth: stitch-reference/notification/code.html
 *   - Pill-shaped capsule, fixed top-center (top: 24px)
 *   - Ambient warm glow blob above capsule (blur-xl)
 *   - Coral ✦ star glyph with pulse animation (#ff7f66)
 *   - Motivation quote in lowercase Arial Bold/Heavy typography, tracking-tight, wrapped in curly quotes, text-[#f7ece8]/95
 *   - Discreet ✕ close button (text-white/40 hover:text-white/80)
 *   - Dark glassmorphism background (#120c0b/90%), coral border (#ff7f66/25), backdrop blur
 *   - 6-second auto-dismiss with slide-up fade-out transition
 *   - Shadow DOM for complete CSS isolation from host page
 *
 * IMPORTANT: Classic (non-module) content script — no import/export.
 * Exposes window.showMotivationHud() and window.__timifyHud() globally.
 */

(function () {
  'use strict';

  if (window.__timifyHudLoaded) return;
  window.__timifyHudLoaded = true;

  // ── Constants ──────────────────────────────────────────────────────────────

  const HUD_HOST_ID     = 'timify-motivation-hud';
  const AUTO_DISMISS_MS = 6000;

  // ── CSS — entirely inside Shadow DOM ──────────────────────────────────────
  //
  // Faithfully translated from stitch-reference/notification/code.html
  // No external dependencies, fully self-contained within Shadow DOM.

  const HUD_CSS = `
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* ── Outer anchor: fixed top-center ──
       Stitch: fixed top-[24px] left-1/2 -translate-x-1/2 z-[99999] pointer-events-auto
               transition-all duration-300 max-w-fit w-auto */
    #hud-root {
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(-14px) scale(0.96);
      z-index: 2147483647;
      pointer-events: auto;
      width: max-content;
      max-width: calc(100vw - 32px);
      opacity: 0;
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                  transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      will-change: opacity, transform;
    }

    #hud-root.hud-visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }

    #hud-root.hud-dismissing {
      opacity: 0;
      transform: translateX(-50%) translateY(-14px) scale(0.96);
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                  transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
    }

    /* ── Pill capsule ──
       Stitch: relative flex items-center gap-3 px-5 sm:px-6 py-2.5 sm:py-3
               rounded-full bg-[#120c0b]/90 backdrop-blur-xl border border-[#ff7f66]/25
               shadow-[0_10px_30px_-5px_rgba(0,0,0,0.7),0_0_18px_rgba(255,127,102,0.12)]
               select-none */
    #hud-capsule {
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 22px;
      border-radius: 9999px;
      background: rgba(18, 12, 11, 0.90);
      -webkit-backdrop-filter: blur(24px);
      backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 127, 102, 0.25);
      box-shadow:
        0 10px 30px -5px rgba(0, 0, 0, 0.70),
        0 0 18px rgba(255, 127, 102, 0.12);
      user-select: none;
      -webkit-user-select: none;
      white-space: nowrap;
    }

    /* ── Subtle warm glow ambient bleed ──
       Stitch: absolute -top-3 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#ff7f66]/15
               rounded-full blur-xl pointer-events-none */
    #hud-glow {
      position: absolute;
      top: -12px;
      left: 50%;
      transform: translateX(-50%);
      width: 128px;
      height: 24px;
      background: rgba(255, 127, 102, 0.15);
      border-radius: 9999px;
      filter: blur(16px);
      pointer-events: none;
    }

    /* ── Coral Star / Petal Accent Glyph ──
       Stitch: text-[#ff7f66] text-xs shrink-0 select-none animate-pulse */
    #hud-star {
      color: #ff7f66;
      font-size: 12px;
      flex-shrink: 0;
      line-height: 1;
      user-select: none;
      -webkit-user-select: none;
      animation: hudPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    /* ── Quote Typography ──
       Stitch: text-[13.5px] sm:text-[14px] text-[#f7ece8]/95 antialiased
               whitespace-nowrap leading-none pt-0.5 font-bold tracking-tight lowercase
               style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif;
                      font-weight: 700; letter-spacing: -0.035em; text-transform: lowercase;" */
    #hud-quote {
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: -0.035em;
      text-transform: lowercase;
      color: rgba(247, 236, 232, 0.95);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      white-space: nowrap;
      line-height: 1;
      padding-top: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 560px;
    }

    /* ── Discreet Close Button ──
       Stitch: ml-1 sm:ml-2 w-4 h-4 rounded-full flex items-center justify-center
               text-white/40 hover:text-white/80 transition-colors duration-150
               text-[11px] leading-none shrink-0 */
    #hud-close {
      margin-left: 6px;
      width: 16px;
      height: 16px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: rgba(255, 255, 255, 0.40);
      font-size: 11px;
      line-height: 1;
      flex-shrink: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      padding: 0;
      font-family: inherit;
      transition: color 0.15s ease;
      outline: none;
    }

    #hud-close:hover {
      color: rgba(255, 255, 255, 0.80);
    }

    #hud-close:focus-visible {
      outline: 1.5px solid rgba(255, 127, 102, 0.5);
      outline-offset: 2px;
    }

    /* ── Pulse Keyframes ──
       Matches Tailwind's animate-pulse: 50% opacity: 0.5 */
    @keyframes hudPulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.5; }
    }
  `;

  // ── DOM Builder ────────────────────────────────────────────────────────────

  /**
   * Builds the complete HUD DOM inside the shadow root.
   * Structure matching Stitch reference exactly:
   *   aside#hud-root
   *     div#hud-capsule
   *       div#hud-glow          (ambient warm glow bleed)
   *       span#hud-star         ✦ (coral star glyph)
   *       p#hud-quote           “quote text” (Arial bold lowercase tracking-tight)
   *       button#hud-close      ✕ (discreet close)
   *
   * @param {ShadowRoot} shadow
   * @param {{ quote?: string, author?: string }} data
   * @param {() => void} dismiss
   * @returns {HTMLElement} hud-root element
   */
  function _buildDom(shadow, data, dismiss) {
    // Styles
    const style = document.createElement('style');
    style.textContent = HUD_CSS;
    shadow.appendChild(style);

    // Root (maps to Stitch's <aside id="timify-hud-banner">)
    const root = document.createElement('aside');
    root.id = 'hud-root';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-atomic', 'true');

    // Capsule
    const capsule = document.createElement('div');
    capsule.id = 'hud-capsule';

    // Ambient glow blob
    const glow = document.createElement('div');
    glow.id = 'hud-glow';
    glow.setAttribute('aria-hidden', 'true');
    capsule.appendChild(glow);

    // ✦ Star glyph — Stitch accent
    const star = document.createElement('span');
    star.id = 'hud-star';
    star.textContent = '\u2736';             // ✦ BLACK FOUR POINTED STAR
    star.setAttribute('aria-hidden', 'true');
    capsule.appendChild(star);

    // Quote paragraph
    const quoteEl = document.createElement('p');
    quoteEl.id = 'hud-quote';
    var rawText = (data && data.quote)
      ? data.quote
      : "if it\u2019s meant to be, it\u2019ll be. let the petals teach you the art of letting go.";

    // Strip any surrounding quote characters, then cleanly wrap in curly quotes “ ”
    var cleaned = rawText.replace(/^[“"']+|[”"']+$/g, '').trim();
    quoteEl.textContent = '\u201C' + _truncate(cleaned, 90) + '\u201D';
    capsule.appendChild(quoteEl);

    // Discreet ✕ close button
    const closeBtn = document.createElement('button');
    closeBtn.id = 'hud-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Dismiss');
    closeBtn.textContent = '\u2715';         // ✕
    closeBtn.addEventListener('click', dismiss);
    capsule.appendChild(closeBtn);

    root.appendChild(capsule);
    shadow.appendChild(root);

    return root;
  }

  /** Truncate to maxLen chars, appending ellipsis. */
  function _truncate(text, maxLen) {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + '\u2026' : text;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Show the Timify motivation HUD on the current page.
   * Removes any existing HUD first (deduplication).
   *
   * @param {{ quote?: string, author?: string }} [data]
   */
  function showMotivationHud(data) {
    console.log('[Timify] showMotivationHud called', data);

    if (typeof document === 'undefined' || !document.documentElement) {
      console.warn('[Timify] No document — skipping HUD');
      return;
    }

    // Remove pre-existing HUD
    var existing = document.getElementById(HUD_HOST_ID);
    if (existing) {
      console.log('[Timify] Removing existing HUD');
      existing.remove();
    }

    // Shadow DOM host — zero-size, visually inert
    var host = document.createElement('div');
    host.id = HUD_HOST_ID;
    var s = host.style;
    s.setProperty('position', 'fixed', 'important');
    s.setProperty('top', '0', 'important');
    s.setProperty('left', '0', 'important');
    s.setProperty('width', '0', 'important');
    s.setProperty('height', '0', 'important');
    s.setProperty('overflow', 'visible', 'important');
    s.setProperty('pointer-events', 'none', 'important');
    s.setProperty('z-index', '2147483647', 'important');
    s.setProperty('border', 'none', 'important');
    s.setProperty('background', 'transparent', 'important');
    s.setProperty('padding', '0', 'important');
    s.setProperty('margin', '0', 'important');
    s.setProperty('display', 'block', 'important');
    s.setProperty('visibility', 'visible', 'important');
    s.setProperty('opacity', '1', 'important');

    var shadow = host.attachShadow({ mode: 'open' });

    var autoDismissTimer = null;

    function dismiss() {
      if (autoDismissTimer) { clearTimeout(autoDismissTimer); autoDismissTimer = null; }
      var hudRoot = shadow.getElementById('hud-root');
      if (!hudRoot) return;
      hudRoot.classList.remove('hud-visible');
      hudRoot.classList.add('hud-dismissing');
      setTimeout(function () {
        if (document.getElementById(HUD_HOST_ID) === host) host.remove();
        console.log('[Timify] HUD dismissed');
      }, 260);
    }

    var hudRoot = _buildDom(shadow, data || {}, dismiss);

    // Attach to <html> so SPAs that replace <body> don't wipe it
    document.documentElement.appendChild(host);
    console.log('[Timify] HUD host appended to <html>');

    // Double rAF: first ensures element is painted, second triggers CSS transition
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        hudRoot.classList.add('hud-visible');
        console.log('[Timify] HUD visible');
      });
    });

    autoDismissTimer = setTimeout(dismiss, AUTO_DISMISS_MS);
  }

  // ── Global exposure ────────────────────────────────────────────────────────

  window.showMotivationHud = showMotivationHud;

  // Immediate console test trigger — open DevTools on any page and run: __timifyHud()
  window.__timifyHud = function (quote, author) {
    showMotivationHud({
      quote:  quote  || "if it’s meant to be, it’ll be. let the petals teach you the art of letting go.",
      author: author || 'Timify',
    });
  };

  console.log('[Timify] motivationHud.js loaded (Stitch exact design) — test: __timifyHud()');
}());
