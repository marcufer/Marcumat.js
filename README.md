# Marcumat.js 🌊✨  
**Ultra Smooth, Responsive Ripple Effect for Web UI**

---

Marcumat.js brings beautiful, interactive ripple (wave) effects to any clickable web element—buttons, cards, menus, and more. It’s designed for high performance and minimal resource usage, and is extremely easy to set up and use.

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

Simply add the `wave` attribute to any element you want to have the ripple effect:

```html
<button wave>Click Me</button>
<div wave class="card">Card Content</div>
```
- Works with buttons, divs, links, custom components—almost anything!

---

## 🎨 Customization Per Element

You can easily control the ripple color and behavior for each element:

- **Set a custom color:**  
  ```html
  <button wave="c=#2196F3">Blue Ripple</button>
  <button wave data-ripple-color="rgba(255,0,0,0.5)">Red Ripple</button>
  ```

---

## 💡 How Marcumat.js Works

1. **Automatic Element Enhancement:**  
   - On page load, all elements with `[wave]` are upgraded for ripple effects.
   - Dynamically added elements with `[wave]` are also detected and enhanced automatically.

2. **Passive & Smart Event Handling:**  
   - Ripple appears only on intentional clicks/taps.
   - Ripple animations are prevented during fast scrolling or accidental gestures.

3. **Resource Pooling:**  
   - Ripple DOM nodes are recycled for maximum memory efficiency.

4. **No Special Configuration Required:**  
   - Just add the script and use the `wave` attribute—no extra setup, no special files needed!
   - Place your script where you want; Marcumat.js will handle everything automatically.

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