///////////////////////////////////////////////////////////////////////////////
// wave-effect (TypeScript) — Smooth Gradient to Peak (v4)
// - Center starts moderately visible (not too faint)
// - Gradually intensifies toward peak (not exceeding peak)
// - No visible "finger hotspot" at center
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
const FALLBACK_BASE_DURATION = 400;
const FALLBACK_FADE_DURATION = 800;
const RIPPLE_HALO_START_DIAMETER = 18;
const COVERAGE_EXPAND_RATIO = 0;
const MAX_RIPPLES_PER_ELEMENT = 1;

const elData: WeakMap<HTMLElement, ElData> = new WeakMap();
const activeRipples: WeakMap<HTMLElement, Set<HTMLElement>> = new WeakMap();
const GRADIENT_TTL = 60000;
const reWaveColor = /(?:^|\s)c\s*[=:]?\s*([#a-zA-Z0-9(),.\s]+)/i;
const reFuncColor = /^(rgba?|hsla?)\(([^)]+)\)$/i;
const now = (): number => (typeof performance !== 'undefined' && (performance as any).now) ? (performance as any).now() : Date.now();
const sqrt2 = Math.SQRT2 || Math.sqrt(2);

// ============================================
// SYSTEM COLORS
// ============================================
interface SystemColor {
  name: string;
  value: string;
  alpha: number;
  isDefault: boolean;
}

const SYSTEM_COLORS: Map<string, SystemColor> = new Map([
  ['default', { name: 'default', value: '#10141C', alpha: 0.22, isDefault: true }],
  ['primary', { name: 'primary', value: '#3B82F6', alpha: 0.25, isDefault: false }],
  ['secondary', { name: 'secondary', value: '#8B5CF6', alpha: 0.25, isDefault: false }],
  ['success', { name: 'success', value: '#10B981', alpha: 0.25, isDefault: false }],
  ['warning', { name: 'warning', value: '#F59E0B', alpha: 0.28, isDefault: false }],
  ['danger', { name: 'danger', value: '#EF4444', alpha: 0.28, isDefault: false }],
  ['light', { name: 'light', value: '#F3F4F6', alpha: 0.35, isDefault: false }],
  ['dark', { name: 'dark', value: '#111827', alpha: 0.35, isDefault: false }]
]);

function getDefaultSystemColor(): SystemColor {
  for (const [, color] of SYSTEM_COLORS) {
    if (color.isDefault) return color;
  }
  return SYSTEM_COLORS.get('default')!;
}

// ============================================
// GRADIENT SYSTEM — Smooth Intensify to Peak
// ============================================
const gradientCache: Map<string, { v: string; t: number }> = new Map();

function computeGradient(
  colorInput: Maybe<string | SystemColor>,
  isSystemColor: boolean = false
): string {
  const d = now();
  const localTTL = PERF_LEVEL === 'low' ? GRADIENT_TTL * 4 : GRADIENT_TTL;
  
  let cacheKey: string;
  let colorValue: string;
  let baseAlpha: number;
  
  if (isSystemColor && typeof colorInput === 'object') {
    const sysColor = colorInput as SystemColor;
    cacheKey = `sys:${sysColor.name}:${PERF_LEVEL}`;
    colorValue = sysColor.value;
    baseAlpha = sysColor.alpha;
  } else if (typeof colorInput === 'string') {
    cacheKey = `custom:${colorInput}:${PERF_LEVEL}`;
    colorValue = colorInput;
    baseAlpha = extractAlpha(colorValue) || 0.22;
  } else {
    return computeGradient(getDefaultSystemColor(), true);
  }
  
  const cached = gradientCache.get(cacheKey);
  if (cached && (d - cached.t) < localTTL) {
    return cached.v;
  }
  
  const gradient = buildGradientString(colorValue, baseAlpha);
  gradientCache.set(cacheKey, { v: gradient, t: d });
  return gradient;
}

function extractAlpha(colorValue: string): number | null {
  const funcMatch = reFuncColor.exec(colorValue.replace(/\s+/g, ''));
  if (funcMatch) {
    const parts = funcMatch[2].split(',');
    if (parts[3] !== undefined) return parseFloat(parts[3]);
  }
  return null;
}

function buildGradientString(colorValue: string, baseAlpha: number): string {
  const rgb = extractRGB(colorValue);
  if (!rgb) {
    return buildSimpleGradient(128, 128, 128, baseAlpha);
  }
  
  const [r, g, b] = rgb;
  
  if (PERF_LEVEL === 'low') {
    return buildSimpleGradient(r, g, b, baseAlpha);
  } else {
    return buildSmoothGradient(r, g, b, baseAlpha);
  }
}

function extractRGB(colorValue: string): [number, number, number] | null {
  const hexMatch = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(colorValue);
  if (hexMatch) {
    let h = hexMatch[1];
    if (h.length === 3) {
      h = h.split('').map(c => c + c).join('');
    }
    const int = parseInt(h, 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  }
  
  const rgbMatch = /^rgba?\(([^)]+)\)$/.exec(colorValue.replace(/\s+/g, ''));
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',');
    return [parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2])];
  }
  
  return null;
}

// ============================================
// SMOOTH GRADIENT — Center builds to Peak
// ============================================
function buildSmoothGradient(r: number, g: number, b: number, alpha: number): string {
  // ไม่มี hotspot ตรงกลาง — เริ่มจากพอเห็น แล้วค่อยๆ เข้มขึ้นไปหา peak
  // โครงสร้าง: visible center → building up → peak → fading out
  
  const centerAlpha = (alpha * 0.45).toFixed(3);      // เริ่มพอเห็น (ไม่จางเกิน)
  const innerBuild = (alpha * 0.68).toFixed(3);       // เริ่มเข้มขึ้น
  const midBuild = (alpha * 0.85).toFixed(3);        // ใกล้ peak
  const peakAlpha = alpha.toFixed(3);                 // เข้มสุด (สูงสุดเท่านี้)
  const outerFade = (alpha * 0.22).toFixed(3);        // เริ่มจาง
  const edgeFade = (alpha * 0.06).toFixed(3);         // จางสุด
  
  return `radial-gradient(circle at center, ` +
    `rgba(${r},${g},${b},${centerAlpha}) 0%, ` +       // center: พอเห็น (45%)
    `rgba(${r},${g},${b},${innerBuild}) 12%, ` +       // เข้มขึ้น (68%)
    `rgba(${r},${g},${b},${midBuild}) 24%, ` +         // ใกล้ peak (85%)
    `rgba(${r},${g},${b},${peakAlpha}) 38%, ` +        // PEAK: เข้มสุด (100%)
    `rgba(${r},${g},${b},${outerFade}) 58%, ` +        // เริ่มจาง (22%)
    `rgba(${r},${g},${b},${edgeFade}) 78%, ` +          // จางมาก (6%)
    `transparent 96%)`;
}

function buildSimpleGradient(r: number, g: number, b: number, alpha: number): string {
  // Low perf: 3 stops แต่ยังคง concept เดียวกัน
  const centerAlpha = (alpha * 0.50).toFixed(3);
  const peakAlpha = alpha.toFixed(3);
  const outerAlpha = (alpha * 0.15).toFixed(3);
  
  return `radial-gradient(circle at center, ` +
    `rgba(${r},${g},${b},${centerAlpha}) 0%, ` +
    `rgba(${r},${g},${b},${peakAlpha}) 35%, ` +
    `rgba(${r},${g},${b},${outerAlpha}) 70%, ` +
    `transparent 92%)`;
}

// ============================================
// COLOR RESOLUTION
// ============================================
function resolveRippleColor(el: HTMLElement): {
  source: 'system' | 'custom' | 'css-var';
  value: string | SystemColor;
  isSystem: boolean;
} {
  const dataAttr = el.getAttribute('data-ripple-color');
  if (dataAttr?.trim()) {
    return { source: 'custom', value: dataAttr.trim(), isSystem: false };
  }
  
  const waveAttr = el.getAttribute('wave') || '';
  const waveMatch = reWaveColor.exec(waveAttr);
  if (waveMatch?.[1]?.trim()) {
    return { source: 'custom', value: waveMatch[1].trim(), isSystem: false };
  }
  
  const themeMatch = /(?:^|\s)theme\s*[=:]?\s*(\w+)/i.exec(waveAttr);
  if (themeMatch?.[1]) {
    const sysColor = SYSTEM_COLORS.get(themeMatch[1].toLowerCase());
    if (sysColor) {
      return { source: 'system', value: sysColor, isSystem: true };
    }
  }
  
  const cssTheme = getComputedStyle(el).getPropertyValue('--ripple-theme').trim();
  if (cssTheme) {
    const sysColor = SYSTEM_COLORS.get(cssTheme.toLowerCase());
    if (sysColor) {
      return { source: 'system', value: sysColor, isSystem: true };
    }
  }
  
  return { source: 'system', value: getDefaultSystemColor(), isSystem: true };
}

// ============================================
// TEMPLATE & POOLING
// ============================================
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
        try { q[i](); } catch (e) { }
      }
      q.length = 0;
      rafId = null;
    });
  }
}

// ============================================
// PERFORMANCE DETECTION
// ============================================
function detectPerformanceLevel(): 'low' | 'medium' | 'high' {
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
    document.documentElement.classList.add(`wave-${PERF_LEVEL}-performance`);
  }
} catch (e) { }

function getMaxRipples() {
  if (PERF_LEVEL === 'low') return 1;
  if (PERF_LEVEL === 'medium') return 1;
  return MAX_RIPPLES_PER_ELEMENT;
}

function getElData(el: HTMLElement): ElData {
  let d = elData.get(el);
  if (!d) { d = { pool: [] }; elData.set(el, d); }
  return d;
}

// ============================================
// TIMING UTILS
// ============================================
function parseTimeToMs(raw: string | null | undefined, fallback: number): number {
  if (!raw) return fallback;
  const s = raw.trim();
  if (!s) return fallback;
  const msMatch = /^(-?\d+(?:\.\d+)?)ms$/.exec(s);
  if (msMatch) return Math.round(parseFloat(msMatch[1]));
  const sMatch = /^(-?\d+(?:\.\d+)?)s$/.exec(s);
  if (sMatch) return Math.round(parseFloat(sMatch[1]) * 1000);
  const numMatch = /^-?\d+(?:\.\d+)?$/.exec(s);
  if (numMatch) return Math.round(parseFloat(s));
  return fallback;
}

function parseOffset(raw: string | null | undefined, expansionDuration: number): number {
  if (!raw) return 0;
  const s = raw.trim();
  if (!s) return 0;
  const pct = /^(-?\d+(?:\.\d+)?)%$/.exec(s);
  if (pct) {
    return Math.round(expansionDuration * (parseFloat(pct[1]) / 100));
  }
  return parseTimeToMs(s, 0);
}

function readTimingFromCSS(el: HTMLElement) {
  let cs: CSSStyleDeclaration | null = null;
  try { cs = getComputedStyle(el); } catch (e) { cs = null; }
  if (!cs && typeof document !== 'undefined') cs = getComputedStyle(document.documentElement);
  const vd = cs ? cs.getPropertyValue('--ripple-duration') : '';
  const vf = cs ? cs.getPropertyValue('--ripple-fade-duration') : '';
  const vo = cs ? cs.getPropertyValue('--ripple-fade-offset') : '';
  return {
    expansionDuration: parseTimeToMs(vd, FALLBACK_BASE_DURATION),
    fadeDuration: parseTimeToMs(vf, FALLBACK_FADE_DURATION),
    fadeOffset: parseOffset(vo, parseTimeToMs(vd, FALLBACK_BASE_DURATION))
  };
}

// ============================================
// RIPPLE LIFECYCLE
// ============================================
function getRippleNode(el: HTMLElement): HTMLElement {
  const d = getElData(el);
  let node = d.pool.pop();
  if (!node) node = _tpl.cloneNode(false) as HTMLElement;
  node.classList.remove('animating', 'fading');
  return node;
}

function releaseRippleNode(el: HTMLElement, node: HTMLElement) {
  node.classList.remove('animating', 'fading');
  try { node.style.opacity = '0'; } catch (e) { }
  try { if (node.parentNode === el) el.removeChild(node); } catch (e) { }
  const d = getElData(el);
  if (!d.pool) d.pool = [];
  if (d.pool.length < getMaxRipples()) d.pool.push(node);
}

function fadeOutAndRemoveRipple(
  ripple: HTMLElement | undefined | null,
  el: HTMLElement,
  fadeDurationOverride?: number
) {
  if (!ripple) return;
  let duration = typeof fadeDurationOverride === 'number' ? fadeDurationOverride : undefined;
  if (duration === undefined) {
    try {
      const cs = getComputedStyle(ripple);
      duration = parseTimeToMs(cs.getPropertyValue('--ripple-fade-duration'), FALLBACK_FADE_DURATION);
    } catch (e) { duration = FALLBACK_FADE_DURATION; }
  }
  ripple.classList.add('fading');
  ripple.style.setProperty('--ripple-fade-duration', duration + 'ms');
  let removed = false;
  function onEnd(e?: TransitionEvent) {
    if (removed) return;
    if (!e || e.propertyName === 'opacity') {
      removed = true;
      ripple.removeEventListener('transitionend', onEnd as EventListener);
      const set = activeRipples.get(el);
      if (set?.delete) set.delete(ripple);
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
    let fd = FALLBACK_FADE_DURATION;
    try {
      const cs = getComputedStyle(node);
      fd = parseTimeToMs(cs.getPropertyValue('--ripple-fade-duration'), FALLBACK_FADE_DURATION);
    } catch (e) { }
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
  return Math.max(max * sqrt2 + expand, 28);
}

function computePointerLocal(el: HTMLElement, pointer: { clientX?: number; clientY?: number; pageX?: number; pageY?: number }) {
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
  return {
    rect,
    x: x < 0 ? 0 : (x > w ? w : x),
    y: y < 0 ? 0 : (y > h ? h : y),
    w, h
  };
}

// ============================================
// ANIMATION
// ============================================
function animateRipple(node: HTMLElement, scale: number, expansionDuration: number) {
  node.style.transform = `translate3d(0,0,0) scale(${scale})`;
  try { (node.style as any).backfaceVisibility = 'hidden'; } catch (e) { }
}

function createRippleElement(
  el: HTMLElement,
  x: number,
  y: number,
  scale: number,
  color: { source: string; value: any; isSystem: boolean },
  timings: { expansionDuration: number; fadeDuration: number; fadeOffset: number }
): HTMLElement {
  const ripple = getRippleNode(el);
  const size = RIPPLE_HALO_START_DIAMETER + 'px';
  const left = (x - RIPPLE_HALO_START_DIAMETER / 2) + 'px';
  const top = (y - RIPPLE_HALO_START_DIAMETER / 2) + 'px';
  
  const bg = computeGradient(color.value, color.isSystem);
  const boxShadow = PERF_LEVEL === 'low' ? 'none' : 'var(--ripple-shadow, 0 4px 12px rgba(8, 12, 20, 0.04))';
  
  ripple.style.cssText =
    `display:block;position:absolute;border-radius:50%;pointer-events:none;` +
    `width:${size};height:${size};left:${left};top:${top};` +
    `--ripple-duration:${timings.expansionDuration}ms;` +
    `--ripple-fade-duration:${timings.fadeDuration}ms;` +
    `--ripple-final-scale:${scale};` +
    `background:${bg};` +
    `transform:scale(1) translate3d(0,0,0);` +
    `backface-visibility:hidden;` +
    `box-shadow:${boxShadow};`;
  
  return ripple;
}

// ============================================
// EVENT HANDLERS
// ============================================
function onPointerDown(this: HTMLElement, e: any) {
  if (e.button && e.button !== 0) return;
  const el = this;
  if (!el) return;
  if ((globalThis as any).__wave_ignore_events__) return;
  if ((onPointerDown as any)._use_isRapidScrollFlag_internal?.()) return;

  let p: any;
  if (e._ripple_override_coords) {
    p = e._ripple_override_coords;
  } else {
    const pointer = e.touches ? e.touches[0] : e;
    p = computePointerLocal(el, pointer);
  }

  const timings = readTimingFromCSS(el);
  const scaledDuration = Math.max(120, Math.round(timings.expansionDuration));
  const fadeDuration = Math.max(32, Math.round(timings.fadeDuration));
  const fadeOffset = Math.max(0, Math.round(timings.fadeOffset));

  const radius = maximalExpandedCoverageRadius(p.x, p.y, p.w, p.h);
  const haloFinalScale = (radius * 2) / RIPPLE_HALO_START_DIAMETER;
  const color = resolveRippleColor(el);

  schedule(function () {
    let set = activeRipples.get(el);
    if (!set) { set = new Set<HTMLElement>(); activeRipples.set(el, set); }
    if (set.size >= getMaxRipples()) {
      const it = set.values().next();
      if (!it.done && it.value) fadeOutAndRemoveRipple(it.value, el, fadeDuration);
    }

    const ripple = createRippleElement(el, p.x, p.y, haloFinalScale, color, timings);
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
      const elapsed = now() - startTime;
      const desiredStart = Math.max(0, scaledDuration - fadeOffset);
      if (elapsed < desiredStart) {
        const waitMs = Math.max(0, desiredStart - elapsed);
        setTimeout(() => {
          if (!ripple.parentNode) return;
          fadeOutAndRemoveRipple(ripple, el, fadeDuration);
          setNow?.delete?.(ripple);
        }, waitMs + 12);
      } else {
        fadeOutAndRemoveRipple(ripple, el, fadeDuration);
        setNow?.delete?.(ripple);
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

    requestAnimationFrame(() => {
      ripple.classList.add('animating');
      animateRipple(ripple, haloFinalScale, scaledDuration);
      setTimeout(() => {
        if (!expansionEnded) {
          expansionEnded = true;
          try {
            ripple.removeEventListener('transitionend', onTransformEnd as EventListener);
          } catch (e) { }
        }
      }, scaledDuration + 220);
    });
  });
}

function onKeyDown(this: HTMLElement, e: KeyboardEvent) {
  if (![' ', 'Enter'].includes((e as any).key)) return;
  const el = this;
  clearRipples(el);
  
  schedule(() => {
    const rect = el.getBoundingClientRect?.() || { width: 0, height: 0 } as DOMRect;
    const x = rect.width / 2;
    const y = rect.height / 2;
    const radius = maximalExpandedCoverageRadius(x, y, rect.width, rect.height);
    const haloFinalScale = (radius * 2) / RIPPLE_HALO_START_DIAMETER;

    const timings = readTimingFromCSS(el);
    const scaledDuration = Math.max(120, Math.round(timings.expansionDuration));
    const fadeDuration = Math.max(32, Math.round(timings.fadeDuration));
    const fadeOffset = Math.max(0, Math.round(timings.fadeOffset));

    const color = resolveRippleColor(el);
    const ripple = createRippleElement(
      el,
      rect.width / 2,
      rect.height / 2,
      haloFinalScale,
      color,
      { expansionDuration: scaledDuration, fadeDuration, fadeOffset }
    );
    
    el.appendChild(ripple);
    let set = activeRipples.get(el);
    if (!set) { set = new Set<HTMLElement>(); activeRipples.set(el, set); }
    set.add(ripple);
    
    requestAnimationFrame(() => {
      ripple.classList.add('animating');
      animateRipple(ripple, haloFinalScale, scaledDuration);
    });
    
    const desiredStart = Math.max(0, scaledDuration - fadeOffset);
    setTimeout(() => {
      fadeOutAndRemoveRipple(ripple, el, fadeDuration);
      set?.delete?.(ripple);
    }, Math.max(120, desiredStart + 20));
  });
}

// ============================================
// DELEGATE SUPPORT
// ============================================
function findWaveDelegateEl(originEl: EventTarget | null, event: any): boolean {
  let el = originEl as HTMLElement | null;
  while (el && el !== document.body) {
    if (el.hasAttribute?.('wave-delegate')) {
      const selector = el.getAttribute('wave-delegate');
      let delegateTarget: HTMLElement | null = null;
      try {
        delegateTarget = selector ? el.querySelector(selector) : null;
      } catch { }
      
      if (delegateTarget?.hasAttribute?.('wave')) {
        const rect = delegateTarget.getBoundingClientRect();
        let clientX = 0, clientY = 0;
        if (event.touches?.[0]) {
          clientX = event.touches[0].clientX;
          clientY = event.touches[0].clientY;
        } else {
          clientX = event.clientX;
          clientY = event.clientY;
        }
        
        const fakeEvent = {
          ...event,
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
        };
        
        (delegateTarget as any)._ripple_delegate_active = true;
        onPointerDown.call(delegateTarget, fakeEvent);

        function forwardEndRipple() {
          if (!(delegateTarget as any)._ripple_delegate_active) return;
          (delegateTarget as any)._ripple_delegate_active = false;
          try {
            const set = activeRipples.get(delegateTarget!);
            if (set?.size) {
              for (const r of Array.from(set)) {
                try { fadeOutAndRemoveRipple(r, delegateTarget!); } catch { }
              }
            }
          } catch { }
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

// ============================================
// SCROLL DETECTION
// ============================================
let isRapidScrollFlag = false;
(function installTouchHandlers() {
  if (typeof document === 'undefined') return;
  let lastScroll = 0;
  let lastX = 0, lastY = 0;
  let hist: Array<{ t: number; x: number; y: number }> = [];
  
  function onTouchStart(e: TouchEvent) {
    const t = e.touches?.[0] || e as any;
    lastX = t.clientX;
    lastY = t.clientY;
    hist.length = 0;
    hist.push({ t: now(), x: lastX, y: lastY });
    isRapidScrollFlag = false;
  }
  
  function onTouchMove(e: TouchEvent) {
    const t = e.touches?.[0] || e as any;
    lastX = t.clientX;
    lastY = t.clientY;
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
      setTimeout(() => { isRapidScrollFlag = false; }, 120);
    }
    lastScroll = t;
  }
  
  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: true });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });

  (onPointerDown as any)._use_isRapidScrollFlag_internal = () => isRapidScrollFlag;
})();

// ============================================
// INITIALIZATION
// ============================================
function upgradeElement(el?: HTMLElement) {
  if (!el) return;
  if (el.classList?.contains(SURFACE_CLASS)) return;
  el.classList.add(SURFACE_CLASS);
  getElData(el);
}

function upgradeAll() {
  document.querySelectorAll('[wave]').forEach(node => upgradeElement(node as HTMLElement));
}

function observeDom() {
  if (typeof IntersectionObserver === 'undefined') {
    upgradeAll();
    return;
  }
  const obs = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) upgradeElement(entry.target as HTMLElement);
    }
  }, { threshold: 0.01 });
  
  document.querySelectorAll('[wave]').forEach(node => obs.observe(node));
}

function globalPointerHandler(e: PointerEvent) {
  if ((e as any).button && (e as any).button !== 0) return;
  if (findWaveDelegateEl(e.target, e)) return;
  
  const el = (e.target as Element)?.closest?.('[wave]') as HTMLElement;
  if (!el || !document.body.contains(el)) return;
  if (!el.classList.contains(SURFACE_CLASS)) upgradeElement(el);
  onPointerDown.call(el, e);
}

function globalKeyHandler(e: KeyboardEvent) {
  const el = (e.target as Element)?.closest?.('[wave]') as HTMLElement;
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

// ============================================
// AUTO LOAD RESOURCES
// ============================================
let waveEffectCSSLoaded = false;
let waveSettingLoaded = false;
let waveJsonLoaded = false;

function autoLoadWaveEffectCSS() {
  if (waveEffectCSSLoaded) return;
  const cssPath = 'https://marcufer.github.io/Marcumat.js/assets/wave-effect.min.css';
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  for (const link of links) {
    if (link.href?.includes(cssPath)) { waveEffectCSSLoaded = true; return; }
  }
  
  if (!document.querySelector(`link[href="${cssPath}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssPath;
    link.onload = () => { waveEffectCSSLoaded = true; };
    link.onerror = () => { waveEffectCSSLoaded = false; };
    document.head.appendChild(link);
  }
}

function autoLoadWaveSettingCSS() {
  if (waveSettingLoaded) return;
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  for (const link of links) {
    if (/wave-setting(\.min)?\.css/i.test(link.href || '')) {
      waveSettingLoaded = true;
      return;
    }
  }
  
  const pathBases = ['/wave-setting.css', '/css/wave-setting.css', '/assets/wave-setting.css'];
  function tryNext(idx: number) {
    if (idx >= pathBases.length) return;
    const href = pathBases[idx];
    if (document.querySelector(`link[href="${href}"]`)) return tryNext(idx + 1);
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => { waveSettingLoaded = true; };
    link.onerror = () => { tryNext(idx + 1); };
    document.head.appendChild(link);
  }
  tryNext(0);
}

function autoLoadWaveSettingJSON(callback?: (opts: any) => void) {
  if (waveJsonLoaded) { callback?.({}); return; }
  
  const pathBases = ['/wave-setting.json', '/css/wave-setting.json', '/assets/wave-setting.json'];
  function tryNext(idx: number) {
    if (idx >= pathBases.length) {
      waveJsonLoaded = true;
      callback?.({});
      return;
    }
    
    fetch(pathBases[idx], { method: 'GET', credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json && typeof json === 'object') {
          waveJsonLoaded = true;
          callback?.(json);
        } else {
          tryNext(idx + 1);
        }
      })
      .catch(() => tryNext(idx + 1));
  }
  tryNext(0);
}

function initWakeEffect() {
  autoLoadWaveEffectCSS();
  autoLoadWaveSettingCSS();
  autoLoadWaveSettingJSON((opts) => {
    if (opts?.disableTapHighlight) {
      const style = document.createElement('style');
      style.textContent = '[wave]{-webkit-tap-highlight-color:transparent!important;tap-highlight-color:transparent!important;}';
      document.head.appendChild(style);
    }
    upgradeAll();
  });
  upgradeAll();
  observeDom();
  installGlobalHandlers();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWakeEffect, { once: true } as AddEventListenerOptions);
  } else {
    initWakeEffect();
  }
}

// ============================================
// PUBLIC API
// ============================================
const config = {
  FALLBACK_BASE_DURATION,
  FALLBACK_FADE_DURATION,
  getCSSVarsForElement(el?: HTMLElement) {
    return el ? readTimingFromCSS(el) : {
      expansionDuration: FALLBACK_BASE_DURATION,
      fadeDuration: FALLBACK_FADE_DURATION,
      fadeOffset: 0
    };
  },
  setFadeDuration() { },
  setRippleDuration() { }
};

const ColorSystem = {
  colors: SYSTEM_COLORS,
  getDefault: getDefaultSystemColor,
  get: (name: string) => SYSTEM_COLORS.get(name.toLowerCase()),
  add: (name: string, value: string, alpha: number = 0.25) => {
    SYSTEM_COLORS.set(name.toLowerCase(), {
      name: name.toLowerCase(),
      value,
      alpha,
      isDefault: false
    });
  }
};

const WaveEffect = {
  upgradeAll,
  upgradeElement,
  clearRipples,
  config,
  ColorSystem,
  settings: {}
};

if (typeof window !== 'undefined') {
  (window as any).WaveEffect = WaveEffect;
}

export default WaveEffect;
