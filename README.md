# Marcumat.js 🌊✨  
**Ultra Smooth, Responsive Ripple Effect for Web UI**

---

Marcumat.js brings beautiful, interactive ripple (wave) effects to your website’s clickable elements—buttons, cards, menus, and more. Designed to be lightweight, fast, and resource-efficient, Marcumat.js is easy to use and highly customizable, with automatic or global settings for your entire site.

---

## 📦 Quick Start

### 1. **Add Marcumat.js to Your Page**

Just insert this `<script>` tag into your HTML (in `<head>` or right before `</body>`):

```html
<script src="https://marcufer.github.io/Marcumat.js/wave-effect.min.js" type="text/javascript" charset="utf-8"></script>
```

Marcumat.js will automatically load its required CSS for you.

---

## 🖱️ Usage: Add Ripple to Any Element

To enable the ripple effect, simply add the `wave` attribute to any HTML element:

```html
<button wave>Click Me</button>
<div wave class="card">Card Content</div>
```

- **You can use `wave` on:**  
  Buttons, links, divs, custom components—any element!

---

## 🎨 Customization Per Element

You can control the ripple color and behavior directly:

- **Set a custom color:**  
  ```html
  <button wave="c=#2196F3">Blue Ripple</button>
  <button wave data-ripple-color="rgba(255,0,0,0.5)">Red Ripple</button>
  ```
- **Other options:**  
  Explore more attributes in the [API section](#api).

---

## ⚙️ Global Website Settings

Marcumat.js supports **site-wide configuration via special files**.  
These files allow you to set options that affect all ripple effects on your website.

### 📁 How Settings Files Work

When the script loads, it automatically looks for these files in the same directory as your HTML file (or the directory where the script is included):

- `wave-setting.css` — Change global ripple appearance with CSS variables.
- `wave-setting.json` — Control global behavior (e.g., disable tap highlight, default colors).

**The search path for these files is based on where your HTML/script is located.**  
If your site structure is like this:

```
/home/index.html
/home/wave-effect.min.js
/home/wave-setting.css
/home/wave-setting.json
```
Marcumat.js will look for settings in `/home/`.

**If you use a different directory (like `/app/`), place the settings files there, and the script will expect:**
```
/app/wave-setting.css
/app/wave-setting.json
```
> ⚠️ **If settings files are not placed in the correct directory, global settings may not apply!**

### 📝 Example: Custom Settings

**wave-setting.css**
```css
:root {
  --ripple-default-color: #4caf50;
  --ripple-blur: 0.8px;
}
```
**wave-setting.json**
```json
{
  "disableTapHighlight": true
}
```

---

## 💡 How It Works: Architecture & Principles

Marcumat.js is designed for performance and simplicity:

1. **Automatic Element Upgrade:**  
   - On page load, all elements with `[wave]` are enhanced for the ripple effect.
   - New elements added later with `[wave]` are also detected (using IntersectionObserver).

2. **Passive & Efficient Events:**  
   - Listeners are passive, so scrolling/touching won’t trigger unwanted ripples.
   - Ripple effects are prevented during rapid scroll or gestures.

3. **Ripple Animation:**  
   - Ripple appears from the point of interaction, expands, fades, and is removed.
   - All animations use GPU acceleration and are resource-pooled.

4. **Global Settings Loader:**  
   - Looks for `wave-setting.css` and `wave-setting.json` relative to the script location.
   - Applies global CSS variables and JSON options (like tap highlight disabling).

5. **Directory Awareness:**  
   - If you serve Marcumat.js from `/home/`, settings should be in `/home/`.
   - If you serve from `/`, settings should be in `/`.
   - Always make sure paths are correct if you move your files!

---

## 🗃️ Directory Structure & File Placement

**Best Practice:**  
Always place your settings files (`wave-setting.css`, `wave-setting.json`) in the same directory as your HTML or Marcumat.js script.

**Example: If your site is in `/website/`**
```
/website/index.html
/website/wave-effect.min.js
/website/wave-setting.css
/website/wave-setting.json
```
Marcumat.js will pick up settings automatically.

**If you put settings in another directory, update the paths accordingly or move your files!**

---

## 🔧 API Reference

- **wave attribute**: Enables ripple effect on element.
- **c=COLOR**: Sets ripple color (e.g., `wave="c=#FF0000"`).
- **data-ripple-color**: Alternate way to specify color.
- **Global settings**: Use `wave-setting.css` and `wave-setting.json` for site-wide options.

---

## 🚨 Stability & Future Plans

Marcumat.js is **actively being developed** and may be less stable than a final release.  
**NPM package support will come in future versions.**

---

## 📄 License

MIT ([LICENSE](LICENSE))

---

## 💬 Feedback & Contributions

- Found a bug or have a suggestion? Open an issue or pull request!
- All feedback is welcome to help make Marcumat.js even better.

---

**Enjoy beautiful, responsive ripple effects with Marcumat.js!**  
🌊💙  