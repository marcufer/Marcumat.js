# Marcumat.js 🌊✨  
**Ultra Smooth, Responsive Ripple Effect for Web UI**

---

Marcumat.js gives your web elements beautiful, interactive ripple (wave) effects—for buttons, cards, menus, and more. It’s designed for maximum performance, minimal resource usage, and is very easy to set up and customize, both per element and globally across your site.

---

## 🚀 Quick Start

### 1. **Install Marcumat.js**

Add this script to your HTML file (in `<head>` or before `</body>`):

```html
<script src="https://marcufer.github.io/Marcumat.js/wave-effect.min.js" type="text/javascript" charset="utf-8"></script>
```

Marcumat.js will automatically load the required CSS for you.

---

## 🖱️ Add Ripple Effect to Elements

Simply add the `wave` attribute to any element:

```html
<button wave>Click Me</button>
<div wave class="card">Card Content</div>
```
- Works with buttons, divs, links, custom UI components—anything!

---

## 📂 Directory Structure & Correct Path Usage

Marcumat.js **looks for special settings files** (`wave-setting.css` and `wave-setting.json`) in the same directory as your HTML file or the script file.

**Example:**  
Suppose you build your site in `/home/`:

```
/home/index.html
/home/wave-effect.min.js
/home/wave-setting.css
/home/wave-setting.json
```
Marcumat.js will automatically search for settings files at `/home/wave-setting.css` and `/home/wave-setting.json`.

**If you use a different directory (e.g., `/myapp/`), place your settings files there:**
```
/myapp/index.html
/myapp/wave-effect.min.js
/myapp/wave-setting.css
/myapp/wave-setting.json
```
**It is important to keep the settings files in the same directory as your HTML/script file!**  
If settings are placed elsewhere (like `/assets/`), you must update your file paths accordingly.

---

## 🔗 How to Connect Your Settings Files

Marcumat.js auto-detects and loads these files:

- **wave-setting.css** — Customizes global ripple appearance using CSS variables.
- **wave-setting.json** — Controls global behavior (e.g., disables tap highlight, sets default colors).

**You do NOT need to manually import these files**—Marcumat.js loads them if they exist in the correct directory.

### **How to Make Sure Your Files Connect Correctly:**

1. **Place `wave-setting.css` and/or `wave-setting.json` in the same directory as your HTML/script file.**
2. **Marcumat.js will auto-load them when the page loads.**
3. **If you move your HTML/script to another directory, move your settings files there too.**
4. **If you want to use a custom path, change your script location to match your settings file location.**

#### ❗ Example: Custom Directory

If your files are in `/dashboard/`:
```
/dashboard/index.html
/dashboard/wave-effect.min.js
/dashboard/wave-setting.css
/dashboard/wave-setting.json
```
Marcumat.js will automatically use `/dashboard/wave-setting.css` and `/dashboard/wave-setting.json`.

#### ⚠️ If settings files are not in the correct directory, Marcumat.js **will NOT apply your global settings**!

---

## 🎨 Customization

### Per Element
- **Custom color:**  
  ```html
  <button wave="c=#2196F3">Blue Ripple</button>
  <button wave data-ripple-color="rgba(255,0,0,0.5)">Red Ripple</button>
  ```

### Global Settings (Affect All Ripples)
- **wave-setting.css** — Example:
  ```css
  :root {
    --ripple-default-color: #2196f3;
    --ripple-blur: 0.7px;
  }
  ```
- **wave-setting.json** — Example:
  ```json
  {
    "disableTapHighlight": true
  }
  ```

---

## 🧠 How Marcumat.js Works

1. **Automatic Element Enhancement:**  
   All elements with `[wave]` are auto-enhanced for ripple effects, including dynamically added elements.
2. **Passive & Smart Event Handling:**  
   Ripples appear only on intentional clicks/taps—never during scrolling or accidental gestures.
3. **Resource Pooling:**  
   Ripple DOM nodes are recycled for memory efficiency.
4. **Global Settings Loader:**  
   On load, Marcumat.js looks for `wave-setting.css` and `wave-setting.json` where your HTML/script is located.
5. **Directory Awareness:**  
   If you use a custom directory, always place your settings files there.

---

## 📝 Example (All Together)

Suppose your project is in `/home/`:

```html
<!-- /home/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Marcumat.js Demo</title>
  <script src="/home/wave-effect.min.js"></script>
</head>
<body>
  <button wave>Default Ripple</button>
  <button wave="c=#e91e63">Pink Ripple</button>
  <div wave style="width:200px;height:100px;background:#eee;">Ripple on Div</div>
</body>
</html>
```

**/home/wave-setting.css**
```css
:root {
  --ripple-default-color: #4caf50;
  --ripple-blur: 0.8px;
}
```

**/home/wave-setting.json**
```json
{
  "disableTapHighlight": true
}
```

---

## 🚨 Development Status

Marcumat.js is **still actively being developed**.  
NPM package support will arrive in a future version.  
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