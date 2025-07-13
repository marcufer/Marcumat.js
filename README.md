# Marcumat.js 🌊✨

Marcumat.js is a highly optimized, lightweight, and ultra-smooth ripple (wave) effect library for web interfaces. It is designed to provide material-like interactive feedback for clickable elements—such as buttons, cards, and any custom UI—with minimal GPU/memory usage and maximal responsiveness.

---

## ⚡️ Features

- **Ultra Smooth Animation**: GPU-accelerated & frame-batched for buttery-smooth ripples.
- **Zero Forced Layout**: No synchronous style recalculation, avoiding layout thrashing.
- **Passive Event Listeners**: Scroll/touch gestures are detected to prevent accidental ripples.
- **Ripple Pooling & Recycling**: Aggressive resource management for lower RAM/GPU usage.
- **No Dependencies**: Just one JS file and one CSS file.
- **Quality and Performance**: Always-high visual quality, with auto-fallback if performance drops.
- **Easy API & Full Feature Parity**: API is simple and compatible with most material ripple behaviors.

---

## 🚀 Getting Started

### 1. Installation

#### CDN Usage (Recommended)
Add the following script tag **at the end of your `<body>` or within your `<head>`** of your HTML file:

```html
<script src="https://marcufer.github.io/Marcumat.js/wave-effect.min.js" type="text/javascript" charset="utf-8"></script>
```

> ⚠️ **Note:** NPM support is not available yet, but is planned for future releases!  
> The system is currently under active development, so stability and API may change.

---

### 2. Usage

#### Step 1: Mark Your Elements

Add the `wave` attribute to any HTML element you want to have a ripple effect.  
Example:

```html
<button wave>Click Me</button>
<div wave class="card">Card Content</div>
```

#### Step 2: Ensure CSS is Loaded

Marcumat.js will automatically inject and load its stylesheet (`wave-effect.min.css`).  
No manual CSS inclusion is required.

#### Step 3: Customization

You can customize the ripple color and behavior:

- **Custom Color**:  
  ```html
  <button wave="c=#2196F3">Blue Ripple</button>
  <button wave data-ripple-color="rgba(255,0,0,0.5)">Red Ripple</button>
  ```
- **Disable Tap Highlight**:  
  The system can inject tap highlight disabling CSS automatically (if configured).

---

## 🧑‍💻 How It Works

- **Automatic Initialization:**  
  On page load, the script scans for `[wave]` elements and upgrades them for ripple support.
- **Passive Event Handling:**  
  Listeners are passive for maximum performance.  
  Ripples are prevented during fast scrolling or touch gestures.
- **Ripple Animation:**  
  When a user interacts (clicks, taps, or presses Enter/Space), a ripple is created and animated from the interaction point.
- **Resource Management:**  
  Ripple nodes are pooled and recycled to reduce DOM memory footprint.
- **Customization:**  
  Ripple color, duration, and blur can be controlled via element attributes or CSS variables.

---

## 📝 Example

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Marcumat.js Demo</title>
  <script src="https://marcufer.github.io/Marcumat.js/wave-effect.min.js"></script>
</head>
<body>
  <button wave>Default Ripple</button>
  <button wave="c=#e91e63">Pink Ripple</button>
  <div wave style="width:200px;height:100px;background:#eee;">Ripple on Div</div>
</body>
</html>
```

---

## 📂 File Structure & Setup

- **wave-effect.min.js**: Main JS library for wave effect.
- **wave-effect.min.css**: CSS for the ripple animation (auto-loaded).
- **Just add the script tag to your HTML.**  
  No build steps, no NPM, no configuration required!

---

## 🚧 Development Status

Marcumat.js is **under active development**.  
Features may change and stability is not guaranteed yet.  
NPM support is planned for future releases.

---

## 📄 License

[MIT License](LICENSE)

---

## 💬 Feedback & Contribution

Feel free to open issues or pull requests!  
Your feedback and suggestions are always welcome.  
Stay tuned for more updates and NPM support!

---

**Enjoy beautiful, responsive ripple effects with Marcumat.js!** 🌊💙