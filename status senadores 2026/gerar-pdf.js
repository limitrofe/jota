const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const htmlPath = path.join(__dirname, 'pdf-print.html');
  const pdfPath = path.join(__dirname, 'senadores-2026.pdf');

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Set viewport to A4 proportions
  await page.setViewport({ width: 794, height: 1123 });

  await page.goto('file://' + htmlPath, { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for images to load
  await page.waitForSelector('.pdf-photo', { timeout: 10000 });

  // Extra wait for all images to finish loading
  await page.evaluate(() => {
    return Promise.all(
      Array.from(document.images)
        .filter(img => !img.complete)
        .map(img => new Promise(resolve => { img.onload = img.onerror = resolve; }))
    );
  });

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
  });

  await browser.close();
  console.log('✅ PDF gerado: ' + pdfPath);
})();
