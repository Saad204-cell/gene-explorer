// Renders each poster to PNG at 2x and runs layout / legibility checks.
const { chromium } = require('playwright');
const path = require('path');
const dir = process.argv[2];
const files = process.argv.slice(3);

(async () => {
  const browser = await chromium.launch();
  for (const file of files) {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
    await page.goto('file://' + path.join(dir, file));
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    const report = await page.evaluate(() => {
      const issues = [];
      const lum = (rgb) => { const c = rgb.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
      const parse = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { rgb: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 }; };
      const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
      const bgOf = (el) => {
        for (let e = el; e; e = e.parentElement) {
          if (e.dataset && e.dataset.bg) return hex(e.dataset.bg);
          const b = parse(getComputedStyle(e).backgroundColor);
          if (b.a > 0.5) return b.rgb;
        }
        return [255, 255, 255];
      };
      const texts = [];
      document.querySelectorAll('.poster *').forEach(el => {
        if (el.closest('svg')) return;
        const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (!own) return;
        const cs = getComputedStyle(el); const fs = parseFloat(cs.fontSize);
        const txt = el.textContent.trim().slice(0, 40);
        if (fs < 18) issues.push(`font ${fs}px: "${txt}"`);
        const fg = parse(cs.color).rgb, bg = bgOf(el);
        const L1 = lum(fg), L2 = lum(bg); const cr = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
        if (cr < 4.5) issues.push(`contrast ${cr.toFixed(2)}: "${txt}"`);
        const r = el.getBoundingClientRect();
        if (r.right > 1080 - 20 || r.left < 20 || r.bottom > 1350 - 24 || r.top < 0) issues.push(`edge (${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}): "${txt}"`);
        if (el.scrollWidth > el.clientWidth + 1 && cs.display !== 'inline') issues.push(`h-overflow: "${txt}"`);
        // line rects for overlap testing
        const range = document.createRange(); range.selectNodeContents(el);
        texts.push({ el, txt, rects: [...range.getClientRects()] });
      });
      for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
        const a = texts[i], b = texts[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        for (const p of a.rects) for (const q of b.rects) {
          const ox = Math.min(p.right, q.right) - Math.max(p.left, q.left), oy = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
          if (ox > 2 && oy > 2) { issues.push(`overlap: "${a.txt}" / "${b.txt}"`); }
        }
      }
      const last = [...document.querySelectorAll('footer, .poster > *')].reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), 0);
      return { issues: [...new Set(issues)], contentBottom: Math.round(last) };
    });
    console.log(`\n== ${file}  (content bottom ${report.contentBottom}px / 1350)`);
    console.log(report.issues.length ? report.issues.join('\n') : 'no issues');
    await page.screenshot({ path: path.join(dir, file.replace('.html', '.png')), clip: { x: 0, y: 0, width: 1080, height: 1350 } });
    await page.close();
  }
  await browser.close();
})();
