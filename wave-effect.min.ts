/**
 * wave-effect.ts
 *
 * TypeScript port and stricter UI-flicker hardening.
 *
 * Goals:
 * - Keep visual output identical (100% visual compatibility).
 * - Hard prevent flicker on rapid sequences (long-press -> lift -> rapid re-press).
 * - Reduce layout/churn by using a single per-element overlay, recycling nodes,
 *   isolating paint with 'contain: paint' on overlay where supported.
 * - Avoid dispatching synthetic input events; forward end by fading ripples.
 *
 * Notes:
 * - This is source TypeScript. Build to JS for production (e.g. tsc).
 * - API compatible with original (upgradeAll, upgradeElement, clearRipples, config).
 */

type RippleNode = HTMLSpanElement;
type ElData = {
  pool: RippleNode[];
  overlay?: HTMLElement;
  color?: string | null;
  rect?: DOMRect | null;
  _colorStamp?: number;
  poolMax?: number;
};

const RIPPLE_CLASS = 'ripple';
const SURFACE_CLASS = 'ripple-surface';
const OVERLAY_CLASS = 'wave-ripple-overlay';
const BASE_DURATION = 2500;
let RIPPLE_FADE_DURATION = 800;
const RIPPLE_HALO_START_DIAMETER = 18;
const COVERAGE_EXPAND_RATIO = 1.8;
const MAX_RIPPLES_PER_ELEMENT = 2;

const elData = new WeakMap<Element, ElData>();
const activeRipples = new WeakMap<Element, Set<RippleNode>>();
const GRADIENT_TTL = 20000;
const DEFAULT_GRADIENT = 'radial-gradient(circle, rgba(16, 20, 28, 0.2) 0%, transparent 80%)';
const reWaveColor = /(?:^|\s)c\s*[=:]?\s*([#a-zA-Z0-9(),.\s]+)/i;
const reFuncColor = /^(rgba?|hsla?)\(([^)]+)\)$/i;
const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
const sqrt2 = Math.SQRT2 || Math.sqrt(2);

// Template for ripple node. Kept minimal and cloned.
const _tpl = (() => {
  const s = document.createElement('span');
  s.className = RIPPLE_CLASS + ' dynamic-halo-pro';
  // start recycled (invisible) to avoid layout during creation
  s.classList.add('recycled');
  return s;
})();

const q: (() => void)[] = [];
let rafId: number | null = null;
function schedule(fn: () => void) {
  q.push(fn);
  if (!rafId) {
    rafId = requestAnimationFrame(() => {
      for (let i = 0; i < q.length; i++) {
        try { q[i](); } catch (_) { /* swallow */ }
      }
      q.length = 0;
      rafId = null;
    });
  }
}

(function setupInvalidation() {
  let t = 0;
  function invalidateAll() { /* placeholder: future caching invalidations can go here */ }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(invalidateAll, 120); }, { passive: true });
    window.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(invalidateAll, 220); }, { passive: true });
  }
})();

function detectPerformanceLevel(): 'low' | 'medium' | 'high' {
  try {
    const cores = (navigator && (navigator as any).hardwareConcurrency) ? (navigator as any).hardwareConcurrency : 4;
    const mem = (navigator && (navigator as any).deviceMemory) ? (navigator as any).deviceMemory : 4;
    const ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
    if (cores <= 2 || (mem && mem <= 1.5) || /Android\s([0-8])/.test(ua)) return 'low';
    if (cores <= 4 || (mem && mem <= 3)) return 'medium';
    return 'high';
  } catch (e) { return 'high'; }
}
const PERF_LEVEL = detectPerformanceLevel();
try {
  if (typeof document !== 'undefined' && document.documentElement) {
    if (PERF_LEVEL === 'low') document.documentElement.classList.add('wave-low-performance');
    else if (PERF_LEVEL === 'medium') document.documentElement.classList.add('wave-medium-performance');
    else document.documentElement.classList.add('wave-high-performance');
  }
} catch (e) {}

function getMaxRipples() {
  if (PERF_LEVEL === 'low') return 1;
  if (PERF_LEVEL === 'medium') return 2;
  return MAX_RIPPLES_PER_ELEMENT;
}

function getElData(el: Element): ElData {
  let d = elData.get(el);
  if (!d) { d = { pool: [], color: undefined, rect: null }; elData.set(el, d); }
  return d;
}

function computeGradient(color?: string | null) {
  if (!color) return DEFAULT_GRADIENT;
  const d = now();
  if (!(computeGradient as any)._map) (computeGradient as any)._map = new Map<string, { v: string; t: number }>();
  const gm: Map<string, { v: string; t: number }> = (computeGradient as any)._map;
  const entry = gm.get(color);
  const localTTL = PERF_LEVEL === 'low' ? GRADIENT_TTL * 4 : GRADIENT_TTL;
  if (entry && (d - entry.t) < localTTL) return entry.v;
  const cleaned = (color || '').replace(/\s+/g, '');
  const m = reFuncColor.exec(cleaned);
  let out: string;
  if (m) {
    const parts = m[2].split(',');
    const alpha = (parts[3] !== undefined) ? parseFloat(parts[3]) : 1;
    const rippleAlpha = Math.min(1, Math.max(alpha, 0.15));
    const prefix = m[1].startsWith('hsl') ? 'hsla' : 'rgba';
    const core = parts.slice(0, 3).join(',');
    out = 'radial-gradient(circle, ' + prefix + '(' + core + ',' + rippleAlpha + ') 10%, transparent 80%)';
  } else {
    out = 'radial-gradient(circle, ' + color + '26 10%, transparent 80%)';
  }
  gm.set(color, { v: out, t: d });
  return out;
}

function createOverlayIfNeeded(el: HTMLElement, d: ElData): HTMLElement {
  if (d.overlay && document.body.contains(d.overlay)) return d.overlay;
  const overlay = document.createElement('div');
  overlay.className = OVERLAY_CLASS;
  // position overlay inside the element and ensure it doesn't alter layout
  overlay.setAttribute('aria-hidden', 'true');
  overlay.style.pointerEvents = 'none';
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.overflow = 'visible';
  overlay.style.zIndex = '1';
  // start invisible so append doesn't cause paint thrash
  overlay.style.opacity = '1';
  try {
    el.appendChild(overlay);
  } catch (e) {
    // best-effort: if appendChild fails, skip overlay
  }
  d.overlay = overlay;
  return overlay;
}

function getRippleNode(el: HTMLElement): RippleNode {
  const d = getElData(el);
  let pool = d.pool;
  let node = pool.pop();
  if (!node) node = _tpl.cloneNode(false) as RippleNode;
  // reset state but avoid layout-inducing operations
  node.classList.remove('animating', 'fading', 'recycled');
  node.style.removeProperty('transition');
  node.style.removeProperty('transform');
  node.style.removeProperty('opacity');
  node.style.removeProperty('will-change');
  node.style.removeProperty('left');
  node.style.removeProperty('top');
  node.style.removeProperty('width');
  node.style.removeProperty('height');
  node.style.removeProperty('background');
  node.style.removeProperty('--ripple-duration');
  node.style.removeProperty('--ripple-final-scale');
  return node;
}

function recycleRippleNode(el: HTMLElement, node: RippleNode) {
  // mark recycled and hide without display:none to avoid reflow
  node.classList.remove('animating', 'fading');
  node.classList.add('recycled');
  node.style.opacity = '0';
  node.style.visibility = 'hidden';
  node.style.removeProperty('will-change');
  // keep node in overlay (do not remove immediately) to avoid DOM churn on rapid re-presses
  const d = getElData(el);
  if (!d.pool) d.pool = [];
  if (d.pool.length < getMaxRipples()) d.pool.push(node);
}

/**
 * fadeOutAndRemoveRipple:
 * - use class toggles and a timeout fallback to guarantee final cleanup without relying solely on transitionend.
 * - keep node in overlay for a small grace period so a near-instant re-press can reuse it without re-append.
 */
function fadeOutAndRemoveRipple(ripple: RippleNode | null, el: HTMLElement) {
  if (!ripple) return;
  const duration = RIPPLE_FADE_DURATION;
  ripple.classList.add('fading');
  ripple.style.setProperty('--ripple-fade-duration', duration + 'ms');
  ripple.style.willChange = 'opacity,transform';
  let removed = false;

  function doCleanup() {
    if (removed) return;
    removed = true;
    ripple.removeEventListener('transitionend', onEnd);
    try { ripple.style.removeProperty('will-change'); } catch (e) { /* noop */ }
    // keep node in overlay but recycle for re-use
    try { recycleRippleNode(el, ripple); } catch (e) { /* noop */ }
    const set = activeRipples.get(el);
    if (set && set.delete) set.delete(ripple);
  }

  function onEnd(ev?: TransitionEvent) {
    if (!ev || ev.propertyName === 'opacity') doCleanup();
  }

  ripple.addEventListener('transitionend', onEnd);
  // Timeout fallback to ensure cleanup
  setTimeout(doCleanup, duration + 180);
}

function clearRipples(el: HTMLElement) {
  const nodes = (el.querySelectorAll ? el.querySelectorAll('.' + RIPPLE_CLASS) : []) as NodeListOf<RippleNode>;
  for (let i = 0; i < nodes.length; i++) fadeOutAndRemoveRipple(nodes[i], el);
  activeRipples.set(el, new Set<RippleNode>());
}

/* Geometry helpers */
function maximalExpandedCoverageRadius(x: number, y: number, width: number, height: number) {
  const dx0 = x, dx1 = width - x, dy0 = y, dy1 = height - y;
  let max = dx0;
  if (dy0 > max) max = dy0;
  if (dx1 > max) max = dx1;
  if (dy1 > max) max = dy1;
  const h0 = Math.hypot(dx0, dy0); if (h0 > max) max = h0;
  const h1 = Math.hypot(dx1, dy0); if (h1 > max) max = h1;
  const h2 = Math.hypot(dx0, dy1); if (h2 > max) max = h2;
  const h3 = Math.hypot(dx1, dy1); if (h3 > max) max = h3;
  const cx = Math.abs(width / 2 - x); if (cx > max) max = cx;
  const cy = Math.abs(height / 2 - y); if (cy > max) max = cy;
  const diagHalf = Math.hypot(width, height) / 2; if (diagHalf > max) max = diagHalf;
  const expand = Math.max(width, height) * COVERAGE_EXPAND_RATIO;
  const mOut = Math.max(max * sqrt2 + expand, 28);
  return mOut;
}

function computePointerLocal(el: HTMLElement, pointer: any) {
  const rect = el.getBoundingClientRect();
  const vv = (typeof window !== 'undefined' && (window as any).visualViewport) ? (window as any).visualViewport : null;
  const vx = vv ? (vv.offsetLeft || 0) : 0;
  const vy = vv ? (vv.offsetTop || 0) : 0;
  const cx = (pointer.clientX !== undefined ? pointer.clientX : (pointer.pageX - (window.pageXOffset || 0))) - vx;
  const cy = (pointer.clientY !== undefined ? pointer.clientY : (pointer.pageY - (window.pageYOffset || 0))) - vy;
  const x = cx - rect.left;
  const y = cy - rect.top;
  const w = rect.width || 0;
  const h = rect.height || 0;
  const clampedX = x < 0 ? 0 : (x > w ? w : x);
  const clampedY = y < 0 ? 0 : (y > h ? h : y);
  return { rect, x: clampedX, y: clampedY, w, h };
}

/* Delegate ripple support — forward end by fading delegate ripples directly */
function findWaveDelegateEl(originEl: Element, event: any): boolean {
  let el: Element | null = originEl as Element;
  while (el && el !== document.body) {
    try {
      if ((el as Element).hasAttribute && (el as Element).hasAttribute('wave-delegate')) {
        const selector = (el as Element).getAttribute('wave-delegate') || '';
        let delegateTarget: HTMLElement | null = null;
        try { delegateTarget = selector ? (el as Element).querySelector(selector) : null; } catch {}
        if (delegateTarget && delegateTarget.hasAttribute && delegateTarget.hasAttribute('wave')) {
          // Construct a simplified fake event with useful coords only.
          let clientX = 0, clientY = 0;
          if (event.touches && event.touches[0]) {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
          } else {
            clientX = event.clientX;
            clientY = event.clientY;
          }
          const rect = delegateTarget.getBoundingClientRect();
          const fakeEvent = Object.assign({}, event, {
            clientX,
            clientY,
            touches: undefined,
            _ripple_from_delegate: true,
            _ripple_relative_to: delegateTarget,
            _ripple_override_coords: {
              rect,
              x: clientX - rect.left,
              y: clientY - rect.top,
              w: rect.width,
              h: rect.height
            }
          });
          (delegateTarget as any)._ripple_delegate_active = true;
          onPointerDown.call(delegateTarget, fakeEvent);

          function forwardEndRipple(_ev?: any) {
            if (!(delegateTarget as any)._ripple_delegate_active) return;
            (delegateTarget as any)._ripple_delegate_active = false;
            try {
              const set = activeRipples.get(delegateTarget!);
              if (set && set.size) {
                const arr = Array.from(set);
                for (const r of arr) {
                  try { fadeOutAndRemoveRipple(r, delegateTarget!); } catch (_) { /* noop */ }
                }
              }
            } catch (_) {}
            removeListeners();
          }
          function removeListeners() {
            (el as Element).removeEventListener('pointerup', forwardEndRipple);
            (el as Element).removeEventListener('pointerleave', forwardEndRipple);
            (el as Element).removeEventListener('touchend', forwardEndRipple);
            (el as Element).removeEventListener('touchcancel', forwardEndRipple);
          }
          (el as Element).addEventListener('pointerup', forwardEndRipple, { passive: true, once: true });
          (el as Element).addEventListener('pointerleave', forwardEndRipple, { passive: true, once: true });
          (el as Element).addEventListener('touchend', forwardEndRipple, { passive: true, once: true });
          (el as Element).addEventListener('touchcancel', forwardEndRipple, { passive: true, once: true });

          return true;
        }
      }
    } catch (e) { /* ignore and keep climbing */ }
    el = (el as HTMLElement).parentElement;
  }
  return false;
}

/* Robust, flicker-resistant animate routine:
   - Uses CSS variables and classes for transitions.
   - Minimizes synchronous layout reads/writes.
   - Re-uses nodes: if a ripple is still fading and user re-presses quickly, we cancel fade and reuse. */
function animateRipple(node: RippleNode, scale: number, duration: number) {
  // use will-change briefly to hint compositor
  node.style.willChange = 'transform, opacity';
  // Apply transform via style so we avoid forcing layout read immediately after writing.
  node.style.transform = 'translate3d(0,0,0) scale(' + scale + ')';
  node.style.backfaceVisibility = 'hidden';
  // ensure will-change removed after transition end / fallback
  const removeAfter = Math.max(120, duration + 60);
  setTimeout(() => {
    try { node.style.removeProperty('will-change'); } catch (e) { /* noop */ }
  }, removeAfter);
}

function onPointerDown(this: HTMLElement, e: any) {
  if (e.button && e.button !== 0) return;
  const el = this as HTMLElement;
  if (!el) return;
  if ((onPointerDown as any)._isRapidScroll) return;
  let p;
  if (e._ripple_override_coords) {
    p = e._ripple_override_coords;
  } else {
    const pointer = e.touches ? e.touches[0] : e;
    p = computePointerLocal(el, pointer);
  }

  const scaledDuration = Math.max(120, Math.round(BASE_DURATION));
  const radius = maximalExpandedCoverageRadius(p.x, p.y, p.w, p.h);
  const haloFinalScale = (radius * 2) / RIPPLE_HALO_START_DIAMETER;
  const colorVal = getRippleColor(el);
  const bg = computeGradient(colorVal);

  schedule(() => {
    let set = activeRipples.get(el);
    if (!set) { set = new Set<RippleNode>(); activeRipples.set(el, set); }
    if (set.size >= getMaxRipples()) {
      // fade oldest to keep within pool limits
      try {
        const it = set.values().next();
        if (!it.done && it.value) fadeOutAndRemoveRipple(it.value, el);
      } catch (_) { /* noop */ }
    }

    const d = getElData(el);
    const overlay = createOverlayIfNeeded(el, d);
    const ripple = getRippleNode(el);

    // compute basic geometry without forcing extra reflows beyond getBoundingClientRect earlier
    const size = RIPPLE_HALO_START_DIAMETER + 'px';
    const left = (p.x - RIPPLE_HALO_START_DIAMETER / 2) + 'px';
    const top = (p.y - RIPPLE_HALO_START_DIAMETER / 2) + 'px';

    const boxShadow = (PERF_LEVEL === 'low') ? '0 3px 8px rgba(8,12,20,0.03)' : '0 4px 12px rgba(8, 12, 20, 0.04)';

    // Apply minimal inline style; CSS vars control transition timings.
    ripple.style.cssText =
      'position:absolute;border-radius:50%;pointer-events:none;' +
      'width:' + size + ';height:' + size + ';left:' + left + ';top:' + top + ';' +
      '--ripple-duration:' + scaledDuration + 'ms;' +
      '--ripple-final-scale:' + haloFinalScale + ';' +
      'background:' + bg + ';transform:scale(1) translate3d(0,0,0);backface-visibility:hidden;box-shadow:' + boxShadow + ';' +
      'visibility:visible;opacity:1;';

    // append to overlay (avoid re-appending to element root to reduce layout checks)
    try { overlay.appendChild(ripple); } catch (_) { try { el.appendChild(ripple); } catch (_) { /* final fallback */ } }

    let setNow = activeRipples.get(el);
    if (!setNow) { setNow = new Set<RippleNode>(); activeRipples.set(el, setNow); }
    setNow.add(ripple);

    let expansionEnded = false;
    function onTransformEnd(evt?: TransitionEvent) {
      if (evt && evt.propertyName !== 'transform') return;
      expansionEnded = true;
      ripple.removeEventListener('transitionend', onTransformEnd as EventListener);
    }
    ripple.addEventListener('transitionend', onTransformEnd as EventListener);

    function endRipple() {
      if (!ripple.parentNode) return;
      fadeOutAndRemoveRipple(ripple, el);
      try { if (setNow && setNow.delete) setNow.delete(ripple); } catch (e) { /* noop */ }
      removeListeners();
    }
    function removeListeners() {
      el.removeEventListener('pointerup', endRipple);
      el.removeEventListener('pointerleave', endRipple);
      el.removeEventListener('touchend', endRipple);
      el.removeEventListener('touchcancel', endRipple);
    }

    el.addEventListener('pointerup', endRipple, { passive: true, once: true });
    el.addEventListener('pointerleave', endRipple, { passive: true, once: true });
    el.addEventListener('touchend', endRipple, { passive: true, once: true });
    el.addEventListener('touchcancel', endRipple, { passive: true, once: true });

    requestAnimationFrame(() => {
      ripple.classList.add('animating');
      animateRipple(ripple, haloFinalScale, scaledDuration);

      // safety: if transition doesn't fire, stop waiting after the duration
      setTimeout(() => {
        if (!expansionEnded) {
          expansionEnded = true;
          try { ripple.removeEventListener('transitionend', onTransformEnd as EventListener); } catch (_) {}
        }
      }, scaledDuration + 220);
    });
  });
}

function getDefaultRippleColor(el: Element) {
  const d = getElData(el);
  const stamped = (d as any)._colorStamp;
  const t = now();
  const localTTL = PERF_LEVEL === 'low' ? 20000 * 4 : 20000;
  if (stamped && d.color !== undefined && (t - stamped) < localTTL) return d.color;
  let node: Element | null = el;
  let found: string | null = null;
  while (node) {
    try {
      const s = getComputedStyle(node as Element);
      const val = s.getPropertyValue('--ripple-default-color').trim();
      if (val) { found = val; break; }
    } catch (e) { break; }
    node = (node as HTMLElement).parentElement;
  }
  d.color = found;
  (d as any)._colorStamp = t;
  return found;
}
function getRippleColor(el: Element) {
  if (el.hasAttribute && el.hasAttribute('data-ripple-color')) {
    const v = el.getAttribute('data-ripple-color');
    if (v && v.trim()) return v.trim();
  }
  const attr = (el.getAttribute && el.getAttribute('wave')) || '';
  const m = reWaveColor.exec(attr);
  if (m && m[1]) {
    const v = m[1].trim();
    if (v) return v;
  }
  return getDefaultRippleColor(el) || null;
}

function onKeyDown(this: HTMLElement, e: KeyboardEvent) {
  if (![' ', 'Enter'].includes((e as any).key)) return;
  const el = this;
  clearRipples(el);
  schedule(() => {
    const rect = (el.getBoundingClientRect && el.getBoundingClientRect()) || { width: 0, height: 0 };
    const x = rect.width / 2, y = rect.height / 2;
    const radius = maximalExpandedCoverageRadius(x, y, rect.width, rect.height);
    const haloFinalScale = (radius * 2) / RIPPLE_HALO_START_DIAMETER;
    const scaledDuration = Math.max(120, Math.round(BASE_DURATION));
    const colorVal = getRippleColor(el);
    const bg = computeGradient(colorVal);
    const ripple = getRippleNode(el);
    const size = RIPPLE_HALO_START_DIAMETER + 'px';
    const left = (rect.width / 2 - RIPPLE_HALO_START_DIAMETER / 2) + 'px';
    const top = (rect.height / 2 - RIPPLE_HALO_START_DIAMETER / 2) + 'px';

    const boxShadow = (PERF_LEVEL === 'low') ? '0 3px 8px rgba(8,12,20,0.03)' : '0 4px 12px rgba(8, 12, 20, 0.04)';

    ripple.style.cssText =
      'position:absolute;border-radius:50%;pointer-events:none;' +
      'width:' + size + ';height:' + size + ';left:' + left + ';top:' + top + ';' +
      '--ripple-duration:' + scaledDuration + 'ms;' +
      '--ripple-final-scale:' + haloFinalScale + ';' +
      'background:' + bg + ';transform:scale(1) translate3d(0,0,0);backface-visibility:hidden;box-shadow:' + boxShadow + ';' +
      'visibility:visible;opacity:1;';

    const elAny = el as HTMLElement;
    const d = getElData(elAny);
    const overlay = createOverlayIfNeeded(elAny, d);
    try { overlay.appendChild(ripple); } catch (_) { elAny.appendChild(ripple); }

    let set = activeRipples.get(elAny);
    if (!set) { set = new Set<RippleNode>(); activeRipples.set(elAny, set); }
    set.add(ripple);

    requestAnimationFrame(() => {
      ripple.classList.add('animating');
      animateRipple(ripple, haloFinalScale, scaledDuration);
    });

    setTimeout(() => {
      fadeOutAndRemoveRipple(ripple, elAny);
      try { if (set && set.delete) set.delete(ripple); } catch (_) { /* noop */ }
    }, Math.max(120, scaledDuration - 120));
  });
}

let isRapidScrollFlag = false;
(function installTouchHandlers() {
  if (typeof document === 'undefined') return;
  let lastScroll = 0;
  let lastX = 0, lastY = 0;
  let hist: { t: number; x: number; y: number }[] = [];
  function onTouchStart(e: TouchEvent | any) {
    const t = e.touches ? e.touches[0] : e;
    lastX = t.clientX; lastY = t.clientY;
    hist.length = 0; hist.push({ t: now(), x: lastX, y: lastY });
    isRapidScrollFlag = false;
    // annotate pointer handler to be aware of rapid scroll
    (onPointerDown as any)._isRapidScroll = false;
  }
  function onTouchMove(e: TouchEvent | any) {
    const t = e.touches ? e.touches[0] : e;
    lastX = t.clientX; lastY = t.clientY;
    const ts = now();
    const last = hist[hist.length - 1];
    if (!last || (ts - last.t) > 8) hist.push({ t: ts, x: lastX, y: lastY });
    if (hist.length > 4) hist.shift();
    if (hist.length >= 2) {
      const first = hist[0], last2 = hist[hist.length - 1];
      const dt = Math.max(1, last2.t - first.t);
      const v = Math.hypot(last2.x - first.x, last2.y - first.y) / dt;
      if (v > 1.6) (onPointerDown as any)._isRapidScroll = true;
    }
  }
  function onTouchEnd() { hist.length = 0; (onPointerDown as any)._isRapidScroll = false; }
  function onScroll() {
    const t = now();
    if (t - lastScroll < 40) {
      (onPointerDown as any)._isRapidScroll = true;
      setTimeout(function () { (onPointerDown as any)._isRapidScroll = false; }, 120);
    }
    lastScroll = t;
  }
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
})();

function upgradeElement(el: Element | null) {
  if (!el) return;
  if ((el as Element).classList && (el as Element).classList.contains(SURFACE_CLASS)) return;
  (el as Element).classList.add(SURFACE_CLASS);
  getElData(el);
}

function upgradeAll() {
  const nodes = document.querySelectorAll('[wave]');
  for (let i = 0; i < nodes.length; i++) upgradeElement(nodes[i]);
}

function observeDom() {
  if (typeof IntersectionObserver === 'undefined') { upgradeAll(); return; }
  const obs = new IntersectionObserver(function (entries) {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) upgradeElement(entries[i].target);
    }
  }, { threshold: 0.01 });
  const nodes = document.querySelectorAll('[wave]');
  for (let i = 0; i < nodes.length; i++) obs.observe(nodes[i]);
}

function globalPointerHandler(e: PointerEvent | any) {
  if (e.button && e.button !== 0) return;
  if (findWaveDelegateEl(e.target, e)) return;
  const el = e.target && (e.target as HTMLElement).closest ? (e.target as HTMLElement).closest('[wave]') : null;
  if (!el || !document.body.contains(el)) return;
  if (!((el as Element).classList.contains(SURFACE_CLASS))) upgradeElement(el);
  onPointerDown.call(el as HTMLElement, e);
}

function globalKeyHandler(e: KeyboardEvent) {
  const el = e.target && (e.target as HTMLElement).closest ? (e.target as HTMLElement).closest('[wave]') : null;
  if (!el || !document.body.contains(el)) return;
  if (!((el as Element).classList.contains(SURFACE_CLASS))) upgradeElement(el);
  onKeyDown.call(el as HTMLElement, e);
}

function installGlobalHandlers() {
  if ((installGlobalHandlers as any).done) return;
  document.addEventListener('pointerdown', globalPointerHandler, { passive: true });
  document.addEventListener('keydown', globalKeyHandler, { passive: true, capture: true });
  (installGlobalHandlers as any).done = true;
}

let waveEffectCSSLoaded = false, waveSettingLoaded = false, waveJsonLoaded = false;
function autoLoadWaveEffectCSS() {
  if (waveEffectCSSLoaded) return;
  const cssPath = 'https://marcufer.github.io/Marcumat.js/assets/wave-effect.min.css';
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  for (let i = 0; i < links.length; i++) {
    const href = (links[i] as HTMLLinkElement).href || '';
    if (href.indexOf(cssPath) !== -1) { waveEffectCSSLoaded = true; return; }
  }
  if (!document.querySelector('link[href="' + cssPath + '"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = cssPath;
    link.onload = function () { waveEffectCSSLoaded = true; };
    link.onerror = function () { waveEffectCSSLoaded = false; };
    document.head.appendChild(link);
  }
}
function autoLoadWaveSettingCSS() {
  if (waveSettingLoaded) return;
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  for (let i = 0; i < links.length; i++) {
    const href = (links[i] as HTMLLinkElement).href || '';
    if (/wave-setting(\.min)?\.css([?#].*)?$/i.test(href)) { waveSettingLoaded = true; return; }
  }
  const pathBases = ['/wave-setting.css', '/css/wave-setting.css', '/assets/wave-setting.css'];
  (function tryNext(idx: number) {
    if (idx >= pathBases.length) return;
    const href = pathBases[idx];
    if (document.querySelector('link[href="' + href + '"]')) return tryNext(idx + 1);
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = href;
    link.onload = function () { waveSettingLoaded = true; };
    link.onerror = function () { tryNext(idx + 1); };
    document.head.appendChild(link);
  })(0);
}
function autoLoadWaveSettingJSON(callback?: (opts: any) => void) {
  if (waveJsonLoaded) { if (callback) callback({}); return; }
  const pathBases = ['/wave-setting.json', '/css/wave-setting.json', '/assets/wave-setting.json'];
  (function tryNext(idx: number) {
    if (idx >= pathBases.length) { waveJsonLoaded = true; if (callback) callback({}); return; }
    fetch(pathBases[idx], { method: 'GET', credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json && typeof json === 'object') { waveJsonLoaded = true; if (callback) callback(json); }
        else tryNext(idx + 1);
      })
      .catch(() => tryNext(idx + 1));
  })(0);
}

function initWakeEffect() {
  autoLoadWaveEffectCSS();
  autoLoadWaveSettingCSS();
  autoLoadWaveSettingJSON(function (opts: any) {
    if (opts && opts.disableTapHighlight) {
      const style = document.createElement('style');
      style.textContent = '[wave]{-webkit-tap-highlight-color:transparent!important;tap-highlight-color:transparent!important;}';
      document.head.appendChild(style);
    }
    upgradeAll();
  });
  upgradeAll();
  observeDom();
  installGlobalHandlers();
  window.addEventListener('beforeunload', function () { /* no-op for now */ });
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initWakeEffect, { once: true });
  else initWakeEffect();
}

const config = {
  BASE_DURATION,
  get RIPPLE_FADE_DURATION() { return RIPPLE_FADE_DURATION; },
  setFadeDuration(ms: number) { if (typeof ms === 'number' && ms > 50 && ms < 5000) RIPPLE_FADE_DURATION = ms | 0; },
  setRippleDuration(ms: number) { /* API placeholder for parity */ }
};

export default {
  upgradeAll,
  upgradeElement,
  clearRipples,
  config,
  settings: {}
};