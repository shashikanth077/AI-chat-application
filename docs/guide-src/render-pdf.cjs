// Prints the HTML guide to PDF with the print stylesheet (every flow expanded, contents links kept).
// Usage: node render-pdf.cjs   (needs the Playwright package; NODE_PATH=$(npm root -g) if it is global)
const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const docs = path.resolve(__dirname, '..');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + path.join(docs, 'AI-Chat-Tech-and-Flow-Guide.html'));
  await page.emulateMedia({ media: 'print' });
  await page.pdf({
    path: path.join(docs, 'AI-Chat-Tech-and-Flow-Guide.pdf'), format: 'A4', printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' }, displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#888">AI Chat: Technology Stack and End-to-End Flows · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
  });
  await browser.close();
})();
