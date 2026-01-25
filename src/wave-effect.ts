///////////////////////////////////////////////////////////////////////////////
// wave-effect (TypeScript) — patched for CSS-driven durations + fade-offset
// - Read durations from CSS variables: --ripple-duration, --ripple-fade-duration
// - New CSS variable --ripple-fade-offset (ms or %) controls when fade-out starts
// - JS uses CSS values as authoritative; constants remain as fallbacks only
// - Keeps compositor-friendly transform-only animations
//
///////////////////////////////////////////////////////////////////////////////

type Maybe<T> = T | null | undefined;

interface ElData {
  pool: HTMLElement[];
  color?: string | null;
  gradient?: string | undefined;
  rect?: DOMRect | undefined;
  _colorStamp?: number;
}

const RIPPLE_CLASS = 'ripple';
const SURFACE_CLASS = 'ripple-surface';
/* Fallback durations (in ms) if CSS vars are not available */
const FALLBACK_BASE_DURATION = 400;
const FALLBACK_FADE_DURATION = 800;
const RIPPLE_HALO_START_DIAMETER = 18;
const COVERAGE_EXPAND_RATIO = 0;
const MAX_RIPPLES_PER_ELEMENT = 1;

const elData: WeakMap<HTMLElement, ElData> = new WeakMap();
const activeRipples: WeakMap<HTMLElement, Set<HTMLElement>> = new WeakMap();
const GRADIENT_TTL = 20000;
const DEFAULT_GRADIENT = 'radial-gradient(circle, rgba(16, 20, 28, 0.2) 0%, transparent 80%)';
const reWaveColor = /(?:^|\s)c\s*[=:]?\s*([#a-zA-Z0-9(),.\s]+)/i;
const reFuncColor = /^(rgba?|hsla?)\(([^)]+)\)$/i;
const now = (): number => (typeof performance !== 'undefined' && (performance as any).now) ? (performance as any).now() : Date.now();
const sqrt2 = Math.SQRT2 || Math.sqrt(2);

// template node used for cloning
const _tpl: HTMLElement = (() => {
  const s = document.createElement('span');
  s.className = RIPPLE_CLASS + ' dynamic-halo-pro';
  s.style.display = 'none';
  return s;
})();

const q: Array<() => void> = [];
let rafId: number | null = null;
function schedule(fn: () => void) {
  q.push(fn);
  if (!rafId) {
    rafId = requestAnimationFrame(() => {
      for (let i = 0; i < q.length; i++) {
        try { q[i](); } catch (e) { /* swallow */ }
      }
      q.length = 0;
      rafId = null;
    });
  }
}

(function setupInvalidation() {
  let t = 0;
  function invalidateAll() { /* placeholder; could refresh cached rects */ }
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(invalidateAll, 120); }, { passive: true });
    window.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(invalidateAll, 220); }, { passive: true });
  }
})();

function detectPerformanceLevel(): 'low'|'medium'|'high' {
  try {
    const nav = navigator as any;
    const cores = nav.hardwareConcurrency ? nav.hardwareConcurrency : 4;
    const mem = nav.deviceMemory ? nav.deviceMemory : 4;
    const ua = navigator.userAgent || '';
    if (cores <= 2 || (mem && mem <= 1.5) || /Android\s([0-8])/.test(ua)) return 'low';
    if (cores <= 4 || (mem && mem <= 3)) return 'medium';
    return 'high';
  } catch (e) { return 'high'; }
}
const PERF_LEVEL = (typeof window !== 'undefined') ? detectPerformanceLevel() : 'high';
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

function getElData(el: HTMLElement): ElData {
  let d = elData.get(el);
  if (!d) { d = { pool: [] }; elData.set(el, d); }
  return d;
}

function computeGradient(color?: Maybe<string>): string {
  if (!color) return DEFAULT_GRADIENT;
  const d = now();
  if (!(computeGradient as any)._map) (computeGradient as any)._map = new Map<string, {v: string; t: number;}>();
  const gm: Map<string, {v: string; t: number;}> = (computeGradient as any)._map;
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

function getRippleNode(el: HTMLElement): HTMLElement {
  const d = getElData(el);
  let pool = d.pool;
  let node = pool.pop();
  if (!node) node = _tpl.cloneNode(false) as HTMLElement;
  node.classList.remove('animating', 'fading');
  // do not fully clear cssText (avoid unnecessary style churn); we'll overwrite what's needed below
  return node;
}

function releaseRippleNode(el: HTMLElement, node: HTMLElement) {
  node.classList.remove('animating', 'fading');
  try { node.style.opacity = '0'; } catch (e) { /* ignore */ }
  // avoid toggling will-change from JS — CSS handles it
  try { if (node.parentNode === el) el.removeChild(node); } catch (e) { /* ignore */ }
  const d = getElData(el);
  if (!d.pool) d.pool = [];
  if (d.pool.length < getMaxRipples()) d.pool.push(node);
}

/* parse css time value like "1500ms", "1.5s", numeric (assume ms) */
function parseTimeToMs(raw: string | null | undefined, fallback: number): number {
  if (!raw) return fallback;
  const s = raw.trim();
  if (!s) return fallback;
  // handle ms
  const msMatch = /^(-?\d+(?:\.\d+)?)ms$/.exec(s);
  if (msMatch) return Math.round(parseFloat(msMatch[1]));
  const sMatch = /^(-?\d+(?:\.\d+)?)s$/.exec(s);
  if (sMatch) return Math.round(parseFloat(sMatch[1]) * 1000);
  // plain number -> assume ms
  const numMatch = /^-?\d+(?:\.\d+)?$/.exec(s);
  if (numMatch) return Math.round(parseFloat(s));
  return fallback;
}

/* parse offset which can be ms or percent (e.g. "10%") */
function parseOffset(raw: string | null | undefined, expansionDuration: number): number {
  if (!raw) return 0;
  const s = raw.trim();
  if (!s) return 0;
  const pct = /^(-?\d+(?:\.\d+)?)%$/.exec(s);
  if (pct) {
    const p = parseFloat(pct[1]);
    return Math.round(expansionDuration * (p / 100));
  }
  // otherwise parse as time
  return parseTimeToMs(s, 0);
}

/* Read effective timing variables for an element (CSS vars), fallback to root, fallback to constants */
function readTimingFromCSS(el: HTMLElement): { expansionDuration: number; fadeDuration: number; fadeOffset: number } {
  let cs: CSSStyleDeclaration | null = null;
  try { cs = getComputedStyle(el); } catch (e) { cs = null; }
  if (!cs && typeof document !== 'undefined') cs = getComputedStyle(document.documentElement);
  const vd = cs ? cs.getPropertyValue('--ripple-duration') : '';
  const vf = cs ? cs.getPropertyValue('--ripple-fade-duration') : '';
  const vo = cs ? cs.getPropertyValue('--ripple-fade-offset') : '';
  const expansionDuration = parseTimeToMs(vd, FALLBACK_BASE_DURATION);
  const fadeDuration = parseTimeToMs(vf, FALLBACK_FADE_DURATION);
  const fadeOffset = parseOffset(vo, expansionDuration);
  return { expansionDuration, fadeDuration, fadeOffset };
}

function fadeOutAndRemoveRipple(ripple: HTMLElement | undefined | null, el: HTMLElement, fadeDurationOverride?: number) {
  if (!ripple) return;
  // get fade duration (either passed or from ripple/style or computed)
  let duration = typeof fadeDurationOverride === 'number' ? fadeDurationOverride : undefined;
  if (duration === undefined) {
    try {
      const cs = getComputedStyle(ripple);
      const val = cs.getPropertyValue('--ripple-fade-duration');
      duration = parseTimeToMs(val, FALLBACK_FADE_DURATION);
    } catch (e) { duration = FALLBACK_FADE_DURATION; }
  }
  ripple.classList.add('fading');
  ripple.style.setProperty('--ripple-fade-duration', duration + 'ms');
  // avoid setting will-change here; CSS already declares it
  let removed = false;
  function onEnd(e?: TransitionEvent) {
    if (removed) return;
    if (!e || e.propertyName === 'opacity') {
      removed = true;
      ripple.removeEventListener('transitionend', onEnd as EventListener);
      // avoid toggling will-change here
      const set = activeRipples.get(el);
      if (set && set.delete) set.delete(ripple);
      releaseRippleNode(el, ripple);
    }
  }
  ripple.addEventListener('transitionend', onEnd as EventListener);
  setTimeout(onEnd, duration + 160);
}

function clearRipples(el: HTMLElement) {
  const nodes = el.querySelectorAll('.' + RIPPLE_CLASS);
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as HTMLElement;
    // pass fade duration read from node or computed style
    let fd = FALLBACK_FADE_DURATION;
    try {
      const cs = getComputedStyle(node);
      fd = parseTimeToMs(cs.getPropertyValue('--ripple-fade-duration'), FALLBACK_FADE_DURATION);
    } catch (e) {}
    fadeOutAndRemoveRipple(node, el, fd);
  }
  activeRipples.set(el, new Set());
}

function maximalExpandedCoverageRadius(x: number, y: number, width: number, height: number): number {
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

function computePointerLocal(el: HTMLElement, pointer: { clientX?: number; clientY?: number; pageX?: number; pageY?: number; } ) {
  const rect = el.getBoundingClientRect();
  const vv: any = (typeof window !== 'undefined' && (window as any).visualViewport) ? (window as any).visualViewport : null;
  const vx = vv ? (vv.offsetLeft || 0) : 0;
  const vy = vv ? (vv.offsetTop || 0) : 0;
  const cx = (pointer.clientX !== undefined ? pointer.clientX : (pointer.pageX! - (window.pageXOffset || 0))) - vx;
  const cy = (pointer.clientY !== undefined ? pointer.clientY : (pointer.pageY! - (window.pageYOffset || 0))) - vy;
  const x = cx - rect.left;
  const y = cy - rect.top;
  const w = rect.width || 0;
  const h = rect.height || 0;
  const clampedX = x < 0 ? 0 : (x > w ? w : x);
  const clampedY = y < 0 ? 0 : (y > h ? h : y);
  return { rect, x: clampedX, y: clampedY, w, h };
}

// Delegate ripple support — forward "end" by fading delegate ripples directly (no synthetic events)
function findWaveDelegateEl(originEl: EventTarget | null, event: any): boolean {
  let el = originEl as HTMLElement | null;
  while (el && el !== document.body) {
    if (el.hasAttribute && el.hasAttribute('wave-delegate')) {
      const selector = el.getAttribute('wave-delegate');
      let delegateTarget: HTMLElement | null = null;
      try {
        delegateTarget = selector ? el.querySelector(selector) : null;
      } catch {}
      if (delegateTarget && delegateTarget.hasAttribute && delegateTarget.hasAttribute('wave')) {
        const rect = delegateTarget.getBoundingClientRect();
        let clientX = 0, clientY = 0;
        if (event.touches && event.touches[0]) {
          clientX = event.touches[0].clientX;
          clientY = event.touches[0].clientY;
        } else {
          clientX = event.clientX;
          clientY = event.clientY;
        }
        const fakeEvent = Object.assign({}, event, {
          clientX, clientY,
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

        function forwardEndRipple(ev: Event) {
          if (!(delegateTarget as any)._ripple_delegate_active) return;
          (delegateTarget as any)._ripple_delegate_active = false;
          try {
            const set = activeRipples.get(delegateTarget!);
            if (set && set.size) {
              const arr = Array.from(set);
              for (let r of arr) {
                try { fadeOutAndRemoveRipple(r, delegateTarget!); } catch (e) {}
              }
            }
          } catch (e) {}
          removeListeners();
        }
        function removeListeners() {
          el!.removeEventListener('pointerup', forwardEndRipple);
          el!.removeEventListener('pointerleave', forwardEndRipple);
          el!.removeEventListener('touchend', forwardEndRipple);
          el!.removeEventListener('touchcancel', forwardEndRipple);
        }
        el.addEventListener('pointerup', forwardEndRipple, { passive: true, once: true });
        el.addEventListener('pointerleave', forwardEndRipple, { passive: true, once: true });
        el.addEventListener('touchend', forwardEndRipple, { passive: true, once: true });
        el.addEventListener('touchcancel', forwardEndRipple, { passive: true, once: true });

        return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

function animateRipple(node: HTMLElement, scale: number, expansionDuration: number) {
  // rely on CSS will-change (set in stylesheet) to promote to compositor; only write transform
  node.style.transform = 'translate3d(0,0,0) scale(' + scale + ')';
  try { (node.style as any).backfaceVisibility = 'hidden'; } catch (e) {}
  // avoid touching will-change here; removal not needed
  const removeAfter = Math.max(120, expansionDuration + 60);
  setTimeout(() => {
    // nothing to remove — keep will-change controlled by CSS
  }, removeAfter);
}

function onPointerDown(this: HTMLElement, e: any) {
  if (e.button && e.button !== 0) return;
  const el = this;
  if (!el) return;
  // read dynamic flag directly (do NOT rely on a stale property copy)
  if ((typeof (globalThis as any) !== 'undefined' && (globalThis as any).__wave_ignore_events__) ) return;
  if ((<any>window).isRapidScrollFlag) {
    // older integrations might expose, but prefer module-level var; fallback below
  }
  if ((<any>window).navigator && false) {} // noop to avoid TS warning

  // Use the module-level isRapidScrollFlag (declared below in installTouchHandlers)
  if ((onPointerDown as any)._use_isRapidScrollFlag_internal && (onPointerDown as any)._use_isRapidScrollFlag_internal()) {
    return;
  }

  let p: any;
  if (e._ripple_override_coords) {
    p = e._ripple_override_coords;
  } else {
    const pointer = e.touches ? e.touches[0] : e;
    p = computePointerLocal(el, pointer);
  }

  // Read timing from CSS (authoritative)
  const timings = readTimingFromCSS(el);
  const scaledDuration = Math.max(120, Math.round(timings.expansionDuration));
  const fadeDuration = Math.max(32, Math.round(timings.fadeDuration)); // min for safety
  const fadeOffset = Math.max(0, Math.round(timings.fadeOffset));

  const radius = maximalExpandedCoverageRadius(p.x, p.y, p.w, p.h);
  const haloFinalScale = (radius * 2) / RIPPLE_HALO_START_DIAMETER;
  const colorVal = getRippleColor(el);
  const bg = computeGradient(colorVal);

  schedule(function () {
    let set = activeRipples.get(el);
    if (!set) { set = new Set<HTMLElement>(); activeRipples.set(el, set); }
    if (set.size >= getMaxRipples()) {
      try {
        const it = set.values().next();
        if (!it.done && it.value) fadeOutAndRemoveRipple(it.value, el, fadeDuration);
      } catch (e) { /* ignore */ }
    }

    const ripple = getRippleNode(el);
    const size = RIPPLE_HALO_START_DIAMETER + 'px';
    const left = (p.x - RIPPLE_HALO_START_DIAMETER / 2) + 'px';
    const top = (p.y - RIPPLE_HALO_START_DIAMETER / 2) + 'px';

    const boxShadow = (PERF_LEVEL === 'low') ? '0 3px 8px rgba(8,12,20,0.03)' : '0 4px 12px rgba(8, 12, 20, 0.04)';

    // Set CSS vars on the ripple so transitions use them
    ripple.style.cssText =
      'display:block;position:absolute;border-radius:50%;pointer-events:none;' +
      'width:' + size + ';height:' + size + ';left:' + left + ';top:' + top + ';' +
      '--ripple-duration:' + scaledDuration + 'ms;' +
      '--ripple-fade-duration:' + fadeDuration + 'ms;' +
      '--ripple-final-scale:' + haloFinalScale + ';' +
      'background:' + bg + ';transform:scale(1) translate3d(0,0,0);backface-visibility:hidden;box-shadow:' + boxShadow + ';';

    el.appendChild(ripple);
    let setNow = activeRipples.get(el);
    if (!setNow) { setNow = new Set<HTMLElement>(); activeRipples.set(el, setNow); }
    setNow.add(ripple);
    let expansionEnded = false;
    const startTime = now();

    function onTransformEnd(evt?: TransitionEvent) {
      if (evt && evt.propertyName !== 'transform') return;
      expansionEnded = true;
      ripple.removeEventListener('transitionend', onTransformEnd as EventListener);
    }
    ripple.addEventListener('transitionend', onTransformEnd as EventListener);

    function endRipple() {
      if (!ripple.parentNode) return;
      // If the transform/expansion hasn't reached the fade-start point yet, wait until then.
      const elapsed = now() - startTime;
      const desiredStart = Math.max(0, scaledDuration - fadeOffset); // ms into animation to start fade
      if (elapsed < desiredStart) {
        const waitMs = Math.max(0, desiredStart - elapsed);
        setTimeout(function () {
          if (!ripple.parentNode) return;
          fadeOutAndRemoveRipple(ripple, el, fadeDuration);
          try { if (setNow && setNow.delete) setNow.delete(ripple); } catch (e) { /* ignore */ }
        }, waitMs + 12);
      } else {
        fadeOutAndRemoveRipple(ripple, el, fadeDuration);
        try { if (setNow && setNow.delete) setNow.delete(ripple); } catch (e) { /* ignore */ }
      }
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

    requestAnimationFrame(function () {
      ripple.classList.add('animating');
      animateRipple(ripple, haloFinalScale, scaledDuration);
      setTimeout(function () {
        if (!expansionEnded) {
          expansionEnded = true;
          try { ripple.removeEventListener('transitionend', onTransformEnd as EventListener); } catch (e) { /* ignore */ }
        }
      }, scaledDuration + 220);
    });
  });
}

function getDefaultRippleColor(el: HTMLElement): string | null | undefined {
  const d = getElData(el);
  const stamped = d._colorStamp;
  const t = now();
  const localTTL = PERF_LEVEL === 'low' ? 20000 * 4 : 20000;
  if (stamped && d.color !== undefined && (t - stamped) < localTTL) return d.color;
  let node: HTMLElement | null = el, found: string | null = null;
  while (node) {
    try {
      const s = getComputedStyle(node);
      const val = s.getPropertyValue('--ripple-default-color').trim();
      if (val) { found = val; break; }
    } catch (e) { break; }
    node = node.parentElement;
  }
  d.color = found;
  d._colorStamp = t;
  return found;
}

function getRippleColor(el: HTMLElement): string | null | undefined {
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
  schedule(function () {
    const rect = (el.getBoundingClientRect && el.getBoundingClientRect()) || { width: 0, height: 0 } as DOMRect;
    const x = rect.width / 2, y = rect.height / 2;
    const radius = maximalExpandedCoverageRadius(x, y, rect.width, rect.height);
    const haloFinalScale = (radius * 2) / RIPPLE_HALO_START_DIAMETER;

    // Read timings from CSS
    const timings = readTimingFromCSS(el);
    const scaledDuration = Math.max(120, Math.round(timings.expansionDuration));
    const fadeDuration = Math.max(32, Math.round(timings.fadeDuration));
    const fadeOffset = Math.max(0, Math.round(timings.fadeOffset));

    const colorVal = getRippleColor(el);
    const bg = computeGradient(colorVal);
    const ripple = getRippleNode(el);
    const size = RIPPLE_HALO_START_DIAMETER + 'px';
    const left = (rect.width / 2 - RIPPLE_HALO_START_DIAMETER / 2) + 'px';
    const top = (rect.height / 2 - RIPPLE_HALO_START_DIAMETER / 2) + 'px';

    const boxShadow = (PERF_LEVEL === 'low') ? '0 3px 8px rgba(8,12,20,0.03)' : '0 4px 12px rgba(8, 12, 20, 0.04)';

    ripple.style.cssText =
      'display:block;position:absolute;border-radius:50%;pointer-events:none;' +
      'width:' + size + ';height:' + size + ';left:' + left + ';top:' + top + ';' +
      '--ripple-duration:' + scaledDuration + 'ms;' +
      '--ripple-fade-duration:' + fadeDuration + 'ms;' +
      '--ripple-final-scale:' + haloFinalScale + ';' +
      'background:' + bg + ';transform:scale(1) translate3d(0,0,0);backface-visibility:hidden;box-shadow:' + boxShadow + ';';
    el.appendChild(ripple);
    let set = activeRipples.get(el);
    if (!set) { set = new Set<HTMLElement>(); activeRipples.set(el, set); }
    set.add(ripple);
    requestAnimationFrame(function () {
      ripple.classList.add('animating');
      animateRipple(ripple, haloFinalScale, scaledDuration);
    });
    // Wait until desired fade-start point so keyboard-triggered ripples match press behavior
    const desiredStart = Math.max(0, scaledDuration - fadeOffset);
    setTimeout(function () {
      fadeOutAndRemoveRipple(ripple, el, fadeDuration);
      try { if (set && set.delete) set.delete(ripple); } catch (e) { /* ignore */ }
    }, Math.max(120, desiredStart + 20));
  });
}

let isRapidScrollFlag = false;
(function installTouchHandlers() {
  if (typeof document === 'undefined') return;
  let lastScroll = 0;
  let lastX = 0, lastY = 0;
  let hist: Array<{t:number,x:number,y:number}> = [];
  function onTouchStart(e: TouchEvent) {
    const t = e.touches ? e.touches[0] : (e as any);
    lastX = (t as any).clientX; lastY = (t as any).clientY;
    hist.length = 0; hist.push({ t: now(), x: lastX, y: lastY });
    isRapidScrollFlag = false;
  }
  function onTouchMove(e: TouchEvent) {
    const t = e.touches ? e.touches[0] : (e as any);
    lastX = (t as any).clientX; lastY = (t as any).clientY;
    const ts = now();
    const last = hist[hist.length - 1];
    if (!last || (ts - last.t) > 8) hist.push({ t: ts, x: lastX, y: lastY });
    if (hist.length > 4) hist.shift();
    if (hist.length >= 2) {
      const first = hist[0], last2 = hist[hist.length - 1];
      const dt = Math.max(1, last2.t - first.t);
      const v = Math.hypot(last2.x - first.x, last2.y - first.y) / dt;
      if (v > 1.6) isRapidScrollFlag = true;
    }
  }
  function onTouchEnd() { hist.length = 0; }
  function onScroll() {
    const t = now();
    if (t - lastScroll < 40) {
      isRapidScrollFlag = true;
      setTimeout(function () { isRapidScrollFlag = false; }, 120);
    }
    lastScroll = t;
  }
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });

  // provide a small helper for onPointerDown so it can read the live flag (no stale copy)
  (onPointerDown as any)._use_isRapidScrollFlag_internal = function () { return isRapidScrollFlag; };
})();

function upgradeElement(el?: HTMLElement) {
  if (!el) return;
  if (el.classList && el.classList.contains(SURFACE_CLASS)) return;
  el.classList.add(SURFACE_CLASS);
  getElData(el);
}
function upgradeAll() {
  const nodes = document.querySelectorAll('[wave]');
  for (let i = 0; i < nodes.length; i++) upgradeElement(nodes[i] as HTMLElement);
}
function observeDom() {
  if (typeof IntersectionObserver === 'undefined') { upgradeAll(); return; }
  const obs = new IntersectionObserver(function (entries) {
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].isIntersecting) upgradeElement(entries[i].target as HTMLElement);
    }
  }, { threshold: 0.01 });
  const nodes = document.querySelectorAll('[wave]');
  for (let i = 0; i < nodes.length; i++) obs.observe(nodes[i]);
}
function globalPointerHandler(e: PointerEvent) {
  if ((e as any).button && (e as any).button !== 0) return;
  if (findWaveDelegateEl(e.target, e)) return;
  const el = e.target && (e.target as Element).closest ? (e.target as Element).closest('[wave]') as HTMLElement : null;
  if (!el || !document.body.contains(el)) return;
  if (!el.classList.contains(SURFACE_CLASS)) upgradeElement(el);
  onPointerDown.call(el, e);
}
function globalKeyHandler(e: KeyboardEvent) {
  const el = e.target && (e.target as Element).closest ? (e.target as Element).closest('[wave]') as HTMLElement : null;
  if (!el || !document.body.contains(el)) return;
  if (!el.classList.contains(SURFACE_CLASS)) upgradeElement(el);
  onKeyDown.call(el, e);
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
    const href = links[i].href || '';
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
    const href = links[i].href || '';
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
  autoLoadWaveSettingJSON(function (opts) {
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
  window.addEventListener('beforeunload', function () { /* placeholder */ });
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initWakeEffect, { once: true } as AddEventListenerOptions);
  else initWakeEffect();
}

const config = {
  /* Keep fallbacks accessible but prefer CSS vars */
  FALLBACK_BASE_DURATION,
  FALLBACK_FADE_DURATION,
  /* programmatic overrides still possible if needed */
  getCSSVarsForElement(el?: HTMLElement) { return el ? readTimingFromCSS(el) : { expansionDuration: FALLBACK_BASE_DURATION, fadeDuration: FALLBACK_FADE_DURATION, fadeOffset: 0 }; },
  setFadeDuration(ms: number) { /* kept for compatibility but CSS is preferred */ },
  setRippleDuration(ms: number) { /* placeholder */ }
};

const WaveEffect = {
  upgradeAll,
  upgradeElement,
  clearRipples,
  config,
  settings: {}
};

// Attach to global if available (simulate UMD default)
declare const globalThis: any;
if (typeof window !== 'undefined') {
  (window as any).WaveEffect = WaveEffect;
}

export default WaveEffect;