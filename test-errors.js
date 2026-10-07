const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true
  });
  const page = await browser.newPage();
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('CONSOLE ERROR:', msg.text());
    else console.log('CONSOLE:', msg.text());
  });
  page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
  
  await page.goto('http://localhost:3000/?view=vertical', { waitUntil: 'networkidle0' });
  await browser.close();
})();
