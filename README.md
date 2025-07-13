# Marcumat.js 🌊✨  
**Ultra Smooth, Responsive Ripple Effect for Web UI**

---

Marcumat.js adds beautiful, interactive ripple (wave) effects to your web elements—buttons, cards, menus, and more.  
It’s fast, lightweight, and designed to be simple to use and configure.

---

## 🚀 Quick Start

### 1. **Install Marcumat.js**

Add this script to your HTML file (in `<head>` or before `</body>`):

```html
<script src="https://marcufer.github.io/Marcumat.js/wave-effect.min.js" type="text/javascript" charset="utf-8"></script>
```
Marcumat.js will automatically load its required CSS for you.

---

## 🖱️ Enable Ripple Effect

Just add the `wave` attribute to any element you want to have the ripple effect:

```html
<button wave>Click Me</button>
<div wave class="card">Card Content</div>
```

Works with buttons, divs, links, custom components—almost anything!

---

## 🎨 Customization Per Element

You can easily control the ripple color and behavior for each element:

- **Set a custom color:**  
  ```html
  <button wave="c=#2196F3">Blue Ripple</button>
  <button wave data-ripple-color="rgba(255,0,0,0.5)">Red Ripple</button>
  ```

---

## 🟩 Setting Default Color & Options for the Whole Page

Marcumat.js allows you to set default colors and global options for ALL ripple effects on a specific page, without needing any special files.  
You can do this by adding CSS variables or JSON settings directly in the page.

### **A. Default Ripple Color with CSS Variables**

Add a style block in your HTML to define the default ripple color for the entire page:

```html
<style>
  :root {
    --ripple-default-color: #4caf50; /* green ripple by default */
    /* You can also tweak the blur effect */
    --ripple-blur: 0.8px;
  }
</style>
```

> All ripple effects on this page will use your chosen default color (unless you override per element).

---

### **B. Global Page Settings with JSON**

Marcumat.js can also read a JSON configuration for global behavior, defined right in your page.
Just add a `<script type="application/json" id="wave-setting-json">` block in your HTML:

```html
<script type="application/json" id="wave-setting-json">
{
  "disableTapHighlight": true
}
</script>
```

#### 🔹 What is `disableTapHighlight`?

The `disableTapHighlight` option removes the default tap highlight color on mobile browsers (especially on Android and iOS).  
Normally, when you tap on an element, the browser shows a colored overlay (tap highlight) for feedback.  
If you set `"disableTapHighlight": true`, Marcumat.js injects CSS to make this overlay fully transparent, so the only feedback users see is the ripple effect itself.

**Benefits:**  
- Looks cleaner and more modern on touch devices  
- Prevents browser highlight from interfering with your ripple animation  
- Recommended for best visual experience

**Without this option:** Users may see both the native tap highlight and the ripple effect at the same time.

---

## 💡 How Marcumat.js Works

1. **Automatic Element Enhancement:**  
   - On page load, all elements with `[wave]` are upgraded for ripple effects.
   - Dynamically added elements with `[wave]` are also enhanced automatically.

2. **Passive & Smart Event Handling:**  
   - Ripple appears only on intentional clicks/taps.
   - Ripple animations are prevented during fast scrolling or accidental gestures.

3. **Resource Pooling:**  
   - Ripple DOM nodes are recycled for maximum memory efficiency.

4. **Default Settings in-Page:**  
   - You can set page-wide defaults using CSS variables (`:root { --ripple-default-color: ... }`)
   - You can set page-wide options using a JSON script block (`<script type="application/json" id="wave-setting-json"> ... </script>`)

---

## 📝 Example (All Together)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Marcumat.js Demo</title>
  <!-- Install Marcumat.js -->
  <script src="https://marcufer.github.io/Marcumat.js/wave-effect.min.js"></script>
  <!-- Set default ripple color and blur for this page -->
  <style>
    :root {
      --ripple-default-color: #e91e63;
      --ripple-blur: 0.7px;
    }
  </style>
  <!-- Set global ripple options for this page -->
  <script type="application/json" id="wave-setting-json">
    { "disableTapHighlight": true }
  </script>
</head>
<body>
  <button wave>Default Ripple</button>
  <button wave="c=#2196F3">Blue Ripple</button>
  <div wave style="width:200px;height:100px;background:#eee;">Ripple on Div</div>
</body>
</html>
```

---

## 🚧 Development Status

Marcumat.js is **still actively being developed**.  
NPM package support will be available in the future.  
Some features may change and the system may not be fully stable yet.

---

## 📄 License

MIT ([LICENSE](LICENSE))

---

## 💬 Feedback & Contributions

- Found a bug or want a feature? Open an issue or pull request!
- Your feedback helps make Marcumat.js better.

---

**Enjoy beautiful, responsive ripple effects with Marcumat.js!**  
🌊💙  