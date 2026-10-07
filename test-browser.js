const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true
  });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.error('REQUEST FAILED:', request.url(), request.failure().errorText));
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await page.goto('http://localhost:3000/?view=vertical', { waitUntil: 'networkidle0' });
  
  await browser.close();
})();
