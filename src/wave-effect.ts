///////////////////////////////////////////////////////////////////////////////
// wave-effect (TypeScript) — Material-Premium edition
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

const BASE_DURATION = 2600;
let RIPPLE_FADE_DURATION = 950;

const RIPPLE_HALO_START_DIAMETER = 18;
const COVERAGE_EXPAND_RATIO = 1.9;
const MAX_RIPPLES_PER_ELEMENT = 2;

// Material tuning
const MATERIAL_DEPTH_SCALE = 1.06;
const MATERIAL_GLOW_SCALE = 1.12;

const elData: WeakMap<HTMLElement, ElData> = new WeakMap();
const activeRipples: WeakMap<HTMLElement, Set<HTMLElement>> = new WeakMap();

const GRADIENT_TTL = 20000;
const DEFAULT_GRADIENT =
  'radial-gradient(circle at 35% 30%, rgba(16,20,28,0.25) 0%, rgba(16,20,28,0.12) 28%, transparent 65%)';

const reWaveColor = /(?:^|\s)c\s*[=:]?\s*([#a-zA-Z0-9(),.\s]+)/i;
const reFuncColor = /^(rgba?|hsla?)\(([^)]+)\)$/i;

const now = (): number =>
  (typeof performance !== 'undefined' && (performance as any).now)
    ? (performance as any).now()
    : Date.now();

const sqrt2 = Math.SQRT2 || Math.sqrt(2);

// template node
const _tpl: HTMLElement = (() => {
  const s = document.createElement('span');
  s.className = RIPPLE_CLASS + ' material-ripple';
  s.style.display = 'none';
  return s;
})();

// RAF scheduler
const q: Array<() => void> = [];
let rafId: number | null = null;

function schedule(fn: () => void) {
  q.push(fn);
  if (!rafId) {
    rafId = requestAnimationFrame(() => {
      for (let i = 0; i < q.length; i++) {
        try { q[i](); } catch {}
      }
      q.length = 0;
      rafId = null;
    });
  }
}

// invalidate placeholder
(function setupInvalidation() {
  let t = 0 as any;
  function invalidateAll() {}
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => {
      clearTimeout(t); t = setTimeout(invalidateAll, 120);
    }, { passive: true });
    window.addEventListener('scroll', () => {
      clearTimeout(t); t = setTimeout(invalidateAll, 220);
    }, { passive: true });
  }
})();

// performance detection
function detectPerformanceLevel(): 'low' | 'medium' | 'high' {
  try {
    const nav = navigator as any;
    const cores = nav.hardwareConcurrency || 4;
    const mem = nav.deviceMemory || 4;
    const ua = navigator.userAgent || '';

    if (cores <= 2 || mem <= 1.5 || /Android\s([0-8])/.test(ua)) return 'low';
    if (cores <= 4 || mem <= 3) return 'medium';
    return 'high';
  } catch { return 'high'; }
}

const PERF_LEVEL = (typeof window !== 'undefined')
  ? detectPerformanceLevel()
  : 'high';

try {
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.classList.add(
      PERF_LEVEL === 'low'
        ? 'wave-low-performance'
        : PERF_LEVEL === 'medium'
          ? 'wave-medium-performance'
          : 'wave-high-performance'
    );
  }
} catch {}

function getMaxRipples() {
  if (PERF_LEVEL === 'low') return 1;
  if (PERF_LEVEL === 'medium') return 2;
  return MAX_RIPPLES_PER_ELEMENT;
}

function getElData(el: HTMLElement): ElData {
  let d = elData.get(el);
  if (!d) {
    d = { pool: [] };
    elData.set(el, d);
  }
  return d;
}

// ===== Material gradient =====
function computeGradient(color?: Maybe<string>): string {
  if (!color) return DEFAULT_GRADIENT;

  const d = now();
  if (!(computeGradient as any)._map)
    (computeGradient as any)._map = new Map<string, { v: string; t: number }>();

  const gm: Map<string, { v: string; t: number }> =
    (computeGradient as any)._map;

  const entry = gm.get(color);
  const localTTL = PERF_LEVEL === 'low' ? GRADIENT_TTL * 4 : GRADIENT_TTL;

  if (entry && (d - entry.t) < localTTL) return entry.v;

  const cleaned = (color || '').replace(/\s+/g, '');
  const m = reFuncColor.exec(cleaned);

  let out: string;

  if (m) {
    const parts = m[2].split(',');
    const alpha = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
    const rippleAlpha = Math.min(1, Math.max(alpha, 0.18));
    const prefix = m[1].startsWith('hsl') ? 'hsla' : 'rgba';
    const core = parts.slice(0, 3).join(',');

    out =
      'radial-gradient(circle at 35% 30%, ' +
      prefix + '(' + core + ',' + (rippleAlpha * 0.55) + ') 0%, ' +
      prefix + '(' + core + ',' + (rippleAlpha * 0.25) + ') 22%, ' +
      prefix + '(' + core + ',' + (rippleAlpha * 0.10) + ') 38%, ' +
      'transparent 65%)';
  } else {
    out =
      'radial-gradient(circle at 35% 30%, ' +
      color + '55 0%, ' +
      color + '26 22%, ' +
      color + '12 38%, ' +
      'transparent 65%)';
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
  return node;
}

function releaseRippleNode(el: HTMLElement, node: HTMLElement) {
  node.classList.remove('animating', 'fading');
  try { node.style.opacity = '0'; } catch {}
  try { if (node.parentNode === el) el.removeChild(node); } catch {}

  const d = getElData(el);
  if (d.pool.length < getMaxRipples()) d.pool.push(node);
}

function fadeOutAndRemoveRipple(ripple: HTMLElement | null | undefined, el: HTMLElement) {
  if (!ripple) return;

  const duration = RIPPLE_FADE_DURATION;

  ripple.classList.add('fading');
  ripple.style.setProperty('--ripple-fade-duration', duration + 'ms');

  ripple.style.setProperty('--_material-glow-scale', '0.9');
  ripple.style.setProperty('--_material-depth-scale', '1');

  let removed = false;

  function onEnd(e?: TransitionEvent) {
    if (removed) return;
    if (!e || e.propertyName === 'opacity') {
      removed = true;
      ripple.removeEventListener('transitionend', onEnd as EventListener);

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
    fadeOutAndRemoveRipple(nodes[i] as HTMLElement, el);
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

  const diagHalf = Math.hypot(width, height) / 2;
  if (diagHalf > max) max = diagHalf;

  const expand = Math.max(width, height) * COVERAGE_EXPAND_RATIO;
  return Math.max(max * sqrt2 + expand, 28);
}

function computePointerLocal(el: HTMLElement, pointer: any) {
  const rect = el.getBoundingClientRect();
  const cx = pointer.clientX;
  const cy = pointer.clientY;

  const x = cx - rect.left;
  const y = cy - rect.top;

  const w = rect.width || 0;
  const h = rect.height || 0;

  return {
    rect,
    x: Math.max(0, Math.min(w, x)),
    y: Math.max(0, Math.min(h, y)),
    w,
    h
  };
}

function animateRipple(node: HTMLElement, scale: number) {
  node.style.transform = 'translate3d(0,0,0) scale(' + scale + ')';
  node.style.setProperty('--_material-depth-scale', (scale * MATERIAL_DEPTH_SCALE).toString());
  node.style.setProperty('--_material-glow-scale', (scale * MATERIAL_GLOW_SCALE).toString());
}

// ===== Pointer handling =====
function onPointerDown(this: HTMLElement, e: any) {
  if (e.button && e.button !== 0) return;
  const el = this;
  if (!el) return;

  let p: any;
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
    if (!set) { set = new Set<HTMLElement>(); activeRipples.set(el, set); }

    if (set.size >= getMaxRipples()) {
      const it = set.values().next();
      if (!it.done && it.value) fadeOutAndRemoveRipple(it.value, el);
    }

    const ripple = getRippleNode(el);
    const size = RIPPLE_HALO_START_DIAMETER + 'px';
    const left = (p.x - RIPPLE_HALO_START_DIAMETER / 2) + 'px';
    const top = (p.y - RIPPLE_HALO_START_DIAMETER / 2) + 'px';

    const glowBoost =
      PERF_LEVEL === 'low' ? 1.02 :
      PERF_LEVEL === 'medium' ? 1.05 : 1.08;

    ripple.style.cssText =
      'display:block;position:absolute;border-radius:50%;pointer-events:none;' +
      'width:' + size + ';height:' + size + ';left:' + left + ';top:' + top + ';' +
      '--ripple-duration:' + scaledDuration + 'ms;' +
      '--ripple-final-scale:' + haloFinalScale + ';' +
      '--ripple-depth-scale:' + MATERIAL_DEPTH_SCALE + ';' +
      '--ripple-glow-scale:' + (MATERIAL_GLOW_SCALE * glowBoost) + ';' +
      'background:' + bg + ';' +
      'transform:scale(1) translate3d(0,0,0);' +
      'backface-visibility:hidden;';

    el.appendChild(ripple);

    let setNow = activeRipples.get(el);
    if (!setNow) { setNow = new Set<HTMLElement>(); activeRipples.set(el, setNow); }
    setNow.add(ripple);

    requestAnimationFrame(() => {
      ripple.classList.add('animating');
      animateRipple(ripple, haloFinalScale);
    });

    function endRipple() {
      fadeOutAndRemoveRipple(ripple, el);
      try { setNow!.delete(ripple); } catch {}
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
  });
}

// ===== Color resolution =====
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
    } catch { break; }
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

// ===== Keyboard =====
function onKeyDown(this: HTMLElement, e: KeyboardEvent) {
  if (![' ', 'Enter'].includes((e as any).key)) return;

  const el = this;
  clearRipples(el);

  schedule(() => {
    const rect = el.getBoundingClientRect();
    const x = rect.width / 2;
    const y = rect.height / 2;

    const radius = maximalExpandedCoverageRadius(x, y, rect.width, rect.height);
    const haloFinalScale = (radius * 2) / RIPPLE_HALO_START_DIAMETER;

    const scaledDuration = Math.max(120, Math.round(BASE_DURATION));
    const colorVal = getRippleColor(el);
    const bg = computeGradient(colorVal);

    const ripple = getRippleNode(el);
    const size = RIPPLE_HALO_START_DIAMETER + 'px';
    const left = (rect.width / 2 - RIPPLE_HALO_START_DIAMETER / 2) + 'px';
    const top = (rect.height / 2 - RIPPLE_HALO_START_DIAMETER / 2) + 'px';

    ripple.style.cssText =
      'display:block;position:absolute;border-radius:50%;pointer-events:none;' +
      'width:' + size + ';height:' + size + ';left:' + left + ';top:' + top + ';' +
      '--ripple-duration:' + scaledDuration + 'ms;' +
      '--ripple-final-scale:' + haloFinalScale + ';' +
      'background:' + bg + ';' +
      'transform:scale(1) translate3d(0,0,0);' +
      'backface-visibility:hidden;';

    el.appendChild(ripple);

    let set = activeRipples.get(el);
    if (!set) { set = new Set<HTMLElement>(); activeRipples.set(el, set); }
    set.add(ripple);

    requestAnimationFrame(() => {
      ripple.classList.add('animating');
      animateRipple(ripple, haloFinalScale);
    });

    setTimeout(() => {
      fadeOutAndRemoveRipple(ripple, el);
      try { set!.delete(ripple); } catch {}
    }, Math.max(120, scaledDuration - 120));
  });
}

// ===== Attach API =====
export function attachWave(el: HTMLElement) {
  el.classList.add(SURFACE_CLASS);
  el.addEventListener('pointerdown', onPointerDown as any, { passive: true });
  el.addEventListener('keydown', onKeyDown as any);
}

export function detachWave(el: HTMLElement) {
  el.classList.remove(SURFACE_CLASS);
  el.removeEventListener('pointerdown', onPointerDown as any);
  el.removeEventListener('keydown', onKeyDown as any);
}