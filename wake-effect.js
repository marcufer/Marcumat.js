/**
 * wake-effect.js
 * Pro Material Ripple Effect: Module-ready, auto-detect wake-setting.css & wake-setting.json,
 * global & per-element logic, global throttle, advanced system config.
 *
 * - Now supports wake-setting.json for system-level options (eg. disable tap highlight)
 * - If "disableTapHighlight": true in wake-setting.json, auto-injects -webkit-tap-highlight-color: transparent
 *   for all `[wake]` elements.
 * - Auto-detect/import wake-setting.css (for developer global theme)
 * - Global + per-element performance throttling
 * - Custom color via data-ripple-color or wake="c=..." or CSS var --ripple-default-color
 * - No dependencies
 *
 * @version 2.1.0
 * @license MIT
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else {
    root.WakeEffect = factory();
  }
}(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // --- Configurable parameters ---
  const RIPPLE_CLASS = 'ripple';
  const SURFACE_CLASS = 'ripple-surface';
  const BASE_DURATION = 720;
  const MIN_DURATION = 520;
  const MAX_EXTRA = 0.17;
  const MIN_RIPPLE_INTERVAL = 150;
  const GLOBAL_MIN_RIPPLE_INTERVAL = 100;
  const GLOBAL_MAX_RIPPLES = 7;

  // --- State ---
  let lastGlobalRippleTime = 0;
  let globalActiveWavesCount = 0;
  const lastAllowed = new WeakMap();
  const activeRipples = new WeakMap();
  let wakeSettingLoaded = false;
  let wakeJsonLoaded = false;
  let settings = {
    disableTapHighlight: false
    // future flags can be added here
  };

  // --- Wake-setting.css AUTO SEARCH & LOAD ---
  function autoLoadWakeSettingCSS() {
    if (wakeSettingLoaded) return;
    for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
      if (link.href && /wake-setting\.css([?#].*)?$/i.test(link.href)) {
        wakeSettingLoaded = true;
        return;
      }
    }
    const candidates = [
      '/wake-setting.css',
      '/css/wake-setting.css',
      '/assets/wake-setting.css',
    ];
    const thisScript = document.currentScript || Array.from(document.scripts).find(s=>/wake-effect(\.min)?\.js$/i.test(s.src));
    if (thisScript && thisScript.src) {
      try {
        const url = new URL(thisScript.src, location.href);
        url.pathname = url.pathname.replace(/[^/]+$/, 'wake-setting.css');
        candidates.push(url.pathname + url.search + url.hash);
      } catch {}
    }
    (function tryNext(idx){
      if (idx >= candidates.length) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = candidates[idx];
      link.onload = function(){wakeSettingLoaded=true;};
      link.onerror = function(){tryNext(idx+1);};
      if (!document.querySelector(`link[href="${link.href}"]`)) {
        document.head.appendChild(link);
      }
    })(0);
  }

  // --- Wake-setting.json AUTO SEARCH & LOAD ---
  function autoLoadWakeSettingJSON(callback) {
    if (wakeJsonLoaded) {
      if (callback) callback(settings);
      return;
    }
    const candidates = [
      '/wake-setting.json',
      '/css/wake-setting.json',
      '/assets/wake-setting.json',
    ];
    const thisScript = document.currentScript || Array.from(document.scripts).find(s=>/wake-effect(\.min)?\.js$/i.test(s.src));
    if (thisScript && thisScript.src) {
      try {
        const url = new URL(thisScript.src, location.href);
        url.pathname = url.pathname.replace(/[^/]+$/, 'wake-setting.json');
        candidates.push(url.pathname + url.search + url.hash);
      } catch {}
    }
    (function tryNext(idx){
      if (idx >= candidates.length) {
        wakeJsonLoaded = true;
        if (callback) callback(settings);
        return;
      }
      fetch(candidates[idx], {method:'GET', credentials:'same-origin'})
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          if (json && typeof json === 'object') {
            wakeJsonLoaded = true;
            Object.assign(settings, json);
            if (callback) callback(settings);
          } else {
            tryNext(idx+1);
          }
        })
        .catch(()=>tryNext(idx+1));
    })(0);
  }

  // --- tap highlight control ---
  let tapHighlightInjected = false;
  function injectTapHighlightCSS() {
    if (tapHighlightInjected) return;
    const style = document.createElement("style");
    style.setAttribute("data-wake-tap-highlight", "true");
    style.textContent = `[wake]{-webkit-tap-highlight-color:transparent!important;tap-highlight-color:transparent!important;}`;
    document.head.appendChild(style);
    tapHighlightInjected = true;
  }

  // --- Core logic ---
  function getDefaultRippleColor(el) {
    let node = el;
    while (node) {
      const style = getComputedStyle(node);
      const val = style.getPropertyValue('--ripple-default-color').trim();
      if (val) return val;
      node = node.parentElement;
    }
    return null;
  }

  function getRippleColor(el) {
    if (el.hasAttribute('data-ripple-color')) {
      let val = el.getAttribute('data-ripple-color').trim();
      if (val) return val;
    }
    const attr = el.getAttribute("wake") || "";
    let m = attr.match(/(?:^|\s)c\s*[=:]?\s*([#a-zA-Z0-9(),.\s]+)/i);
    if (m && m[1]) {
      let val = m[1].trim();
      if (val) return val;
    }
    let def = getDefaultRippleColor(el);
    if (def) return def;
    return null;
  }

  function getRippleBg(color) {
    if (color) {
      if (/^rgba?\([^)]+\)$/i.test(color) || /^hsla?\([^)]+\)$/i.test(color)) {
        let main = color.replace(/\s+/g,'');
        let inside = main.match(/\(([^)]+)\)/);
        if (inside) {
          let parts = inside[1].split(',');
          let alpha = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
          let p1 = Math.min(1, alpha);
          let p2 = Math.max(0, 0.85 * p1);
          let p3 = Math.max(0, 0.7 * p1);
          let c1 = parts.slice(0,3).join(',') + ',' + p1;
          let c2 = parts.slice(0,3).join(',') + ',' + p2;
          let c3 = parts.slice(0,3).join(',') + ',' + p3;
          let prefix = color.startsWith('hsla') ? 'hsla' : (color.startsWith('hsl') ? 'hsla' : 'rgba');
          return `radial-gradient(circle, ${prefix}(${c1}) 50%, ${prefix}(${c2}) 86%, ${prefix}(${c3}) 100%)`;
        }
      }
      return `radial-gradient(circle, ${color} 50%, ${color}CC 86%, ${color}99 100%)`;
    }
    return `radial-gradient(circle, rgba(255,255,255,0.42) 50%, rgba(255,255,255,0.37) 86%, rgba(255,255,255,0.30) 100%)`;
  }

  function oversizeRatio(x, y, width, height) {
    const cx = width / 2, cy = height / 2;
    const maxDist = Math.hypot(cx, cy);
    const pointerDist = Math.hypot(x - cx, y - cy);
    return 1.38 - 0.22 * Math.min(pointerDist / maxDist, 1);
  }

  function smartBlur(oversize) {
    const minOver = 1.18, maxOver = 1.38;
    const minBlur = 1.28, maxBlur = 0.76;
    const ratio = (oversize - minOver) / (maxOver - minOver);
    const blurVal = minBlur + (maxBlur - minBlur) * Math.max(0, Math.min(ratio,1));
    return `blur(${blurVal.toFixed(2)}px)`;
  }

  function farthestDistance(x, y, width, height) {
    const toTopLeft     = Math.hypot(x, y);
    const toTopRight    = Math.hypot(width - x, y);
    const toBottomLeft  = Math.hypot(x, height - y);
    const toBottomRight = Math.hypot(width - x, height - y);
    return Math.max(toTopLeft, toTopRight, toBottomLeft, toBottomRight);
  }

  function smartDuration(x, y, width, height) {
    const cx = width / 2, cy = height / 2;
    const maxDist = farthestDistance(cx, cy, width, height);
    const pointerDist = Math.hypot(x - cx, y - cy);
    const ratio = Math.min(pointerDist / maxDist, 1);
    const duration = BASE_DURATION - (BASE_DURATION - MIN_DURATION) * (ratio * MAX_EXTRA);
    return Math.round(duration);
  }

  function clearRipples(el) {
    const ripples = el.querySelectorAll('.' + RIPPLE_CLASS);
    ripples.forEach(r => {
      r.classList.add('fading');
      setTimeout(()=>{
        r.remove();
        globalActiveWavesCount = Math.max(0, globalActiveWavesCount-1);
      }, 750);
    });
    activeRipples.set(el, null);
  }

  function allowGlobalRipple() {
    const now = performance.now();
    if (now - lastGlobalRippleTime < GLOBAL_MIN_RIPPLE_INTERVAL) return false;
    if (globalActiveWavesCount >= GLOBAL_MAX_RIPPLES) return false;
    lastGlobalRippleTime = now;
    globalActiveWavesCount++;
    return true;
  }

  function onPointerDown(e) {
    if (e.button && e.button !== 0) return;
    const el = e.currentTarget;

    if (!allowGlobalRipple()) return;

    const now = performance.now();
    const last = lastAllowed.get(el) || 0;
    if (now - last < MIN_RIPPLE_INTERVAL) {
      globalActiveWavesCount = Math.max(0, globalActiveWavesCount-1);
      return;
    }
    if (activeRipples.get(el)) {
      globalActiveWavesCount = Math.max(0, globalActiveWavesCount-1);
      return;
    }
    lastAllowed.set(el, now);

    const pointer = e.touches?.[0] || e;
    const rect = el.getBoundingClientRect();
    const x = pointer.clientX - rect.left;
    const y = pointer.clientY - rect.top;
    const oversize = oversizeRatio(x, y, rect.width, rect.height);
    const radius = farthestDistance(x, y, rect.width, rect.height) * oversize;
    const size = radius * 2;
    const duration = smartDuration(x, y, rect.width, rect.height);

    const colorVal = getRippleColor(el);
    const bg = getRippleBg(colorVal);

    const ripple = document.createElement('span');
    ripple.className = RIPPLE_CLASS;
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x - size/2}px`;
    ripple.style.top = `${y - size/2}px`;
    ripple.style.setProperty('--ripple-duration', duration + 'ms');
    ripple.style.setProperty('--ripple-blur', smartBlur(oversize));
    ripple.style.background = bg;
    el.appendChild(ripple);

    activeRipples.set(el, ripple);

    requestAnimationFrame(()=>ripple.classList.add('animating'));

    function endRipple(){
      ripple.classList.add('fading');
      setTimeout(()=>{
        ripple.remove();
        globalActiveWavesCount = Math.max(0, globalActiveWavesCount-1);
      }, 750);
      activeRipples.set(el, null);
      el.removeEventListener('pointerup', endRipple);
      el.removeEventListener('pointerleave', endRipple);
      el.removeEventListener('touchend', endRipple);
      el.removeEventListener('touchcancel', endRipple);
    }
    el.addEventListener('pointerup', endRipple);
    el.addEventListener('pointerleave', endRipple);
    el.addEventListener('touchend', endRipple);
    el.addEventListener('touchcancel', endRipple);
  }

  function onKeyDown(e) {
    if (![' ', 'Enter'].includes(e.key)) return;
    const el = e.currentTarget;
    clearRipples(el);

    if (!allowGlobalRipple()) return;

    const rect = el.getBoundingClientRect();
    const x = rect.width / 2, y = rect.height / 2;
    const oversize = oversizeRatio(x, y, rect.width, rect.height);
    const radius = farthestDistance(x, y, rect.width, rect.height) * oversize;
    const size = radius * 2;
    const duration = BASE_DURATION;
    const colorVal = getRippleColor(el);
    const bg = getRippleBg(colorVal);
    const ripple = document.createElement('span');
    ripple.className = RIPPLE_CLASS;
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${rect.width/2 - size/2}px`;
    ripple.style.top = `${rect.height/2 - size/2}px`;
    ripple.style.setProperty('--ripple-duration', duration + 'ms');
    ripple.style.setProperty('--ripple-blur', smartBlur(oversize));
    ripple.style.background = bg;
    el.appendChild(ripple);
    requestAnimationFrame(()=>ripple.classList.add('animating'));
    setTimeout(()=>{
      ripple.classList.add('fading');
      setTimeout(()=>{
        ripple.remove();
        globalActiveWavesCount = Math.max(0, globalActiveWavesCount-1);
      }, 750);
    }, duration - 140);
    activeRipples.set(el, null);
    lastAllowed.set(el, performance.now());
  }

  function upgradeAll() {
    document.querySelectorAll('[wake]').forEach(upgradeElement);
    // tap highlight (if needed)
    if (settings.disableTapHighlight) injectTapHighlightCSS();
  }
  function upgradeElement(el) {
    if (el.classList.contains(SURFACE_CLASS)) return;
    el.classList.add(SURFACE_CLASS);
    el.addEventListener('pointerdown', onPointerDown, {passive:true});
    el.addEventListener('keydown', onKeyDown);
    // tap highlight (if needed)
    if (settings.disableTapHighlight) injectTapHighlightCSS();
  }

  function initWakeEffect() {
    // Auto-load wake-setting.css
    autoLoadWakeSettingCSS();
    // Auto-load wake-setting.json and apply settings
    autoLoadWakeSettingJSON(function(opts){
      if (opts && opts.disableTapHighlight) injectTapHighlightCSS();
      upgradeAll();
    });
    // Upgrade all elements on load
    upgradeAll();
    // Watch for new elements or attribute changes
    new MutationObserver(upgradeAll).observe(document.documentElement, {
      subtree:true, childList:true, attributes:true, attributeFilter:['wake','data-ripple-color']
    });
    // SPA cleanup
    window.addEventListener('beforeunload', ()=>{
      lastGlobalRippleTime = 0;
      globalActiveWavesCount = 0;
    });
  }

  // Auto-initialize if in browser (not if imported as ES module explicitly)
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initWakeEffect, {once:true});
    } else {
      initWakeEffect();
    }
  }

  // Export API for module use
  return {
    upgradeAll,
    upgradeElement,
    clearRipples,
    config: {
      BASE_DURATION,
      MIN_DURATION,
      MAX_EXTRA,
      MIN_RIPPLE_INTERVAL,
      GLOBAL_MIN_RIPPLE_INTERVAL,
      GLOBAL_MAX_RIPPLES
    },
    settings // expose for inspection
  };
}));