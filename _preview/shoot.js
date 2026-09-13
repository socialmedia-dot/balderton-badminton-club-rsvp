const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/home/ubuntu/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', msg => console.log('  [console]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('  [pageerror]', err.message));

  const targets = [
    { html: '_preview/preview-member.html', png: '_preview/preview-member.png', setMember: true },
    { html: '_preview/preview-admin.html', png: '_preview/preview-admin.png', setMember: false },
  ];

  for (const t of targets) {
    const baseDir = path.resolve(__dirname, '..');
    const url = 'file://' + path.resolve(baseDir, t.html);
    console.log('shooting', url);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(2000);  // let CDN scripts load
    console.log('  page title:', await page.title());
    if (t.setMember) {
      // Pick first member so we can see the RSVP cards
      await page.evaluate(() => {
        const sel = document.querySelector('select');
        if (sel && sel.options.length > 1) {
          sel.value = sel.options[1].value;
          sel.dispatchEvent(new Event('change'));
        }
      });
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.resolve(baseDir, t.png), fullPage: true });
    console.log('→ saved', t.png);
  }

  await browser.close();
})();
