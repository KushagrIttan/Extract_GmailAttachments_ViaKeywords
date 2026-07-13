import puppeteer from 'puppeteer';
import { marked } from 'marked';
import fs from 'fs';
import path from 'path';

(async () => {
  const mdPath = path.resolve('../documentation.md');
  const pdfPath = path.resolve('../documentation.pdf');
  
  const markdown = fs.readFileSync(mdPath, 'utf8');
  const htmlContent = marked(markdown);
  
  // Wrap with basic HTML for styling
  const fullHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body {
        font-family: Arial, sans-serif;
        line-height: 1.6;
        padding: 20px;
        color: #333;
      }
      h1, h2, h3 { color: #111; }
      img { max-width: 100%; height: auto; border: 1px solid #ddd; }
      code { background: #f4f4f4; padding: 2px 5px; border-radius: 3px; }
    </style>
  </head>
  <body>
    ${htmlContent}
  </body>
  </html>
  `;

  // Write temporary HTML file
  const tempHtmlPath = path.resolve('../temp.html');
  fs.writeFileSync(tempHtmlPath, fullHtml);

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Use file:// protocol to render the local HTML with local images
  await page.goto(`file:///${tempHtmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0' });
  
  await page.pdf({ path: pdfPath, format: 'A4', margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' } });

  await browser.close();
  fs.unlinkSync(tempHtmlPath);
  
  console.log('PDF generated at:', pdfPath);
})();
