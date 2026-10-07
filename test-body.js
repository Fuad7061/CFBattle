const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/?view=vertical', { waitUntil: 'networkidle0' });
  const html = await page.evaluate(() => document.body.innerHTML);
  console.log("HTML length:", html.length);
  if (html.length < 500) console.log("HTML:", html);
  await browser.close();
})();
