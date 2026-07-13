import puppeteer from 'puppeteer';
import fs from 'fs';

(async () => {
  const snippetsDir = 'C:/Users/Kushagr/Documents/UiPath/Extract_GmailAttachments_ViaKeywords/snippets';
  if (!fs.existsSync(snippetsDir)) {
    fs.mkdirSync(snippetsDir, { recursive: true });
  }

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 800 });

  console.log('Navigating to http://localhost:5173');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });

  await new Promise(r => setTimeout(r, 2000));

  console.log('Taking Onboarding Step 1 screenshot');
  await page.screenshot({ path: `${snippetsDir}/onboarding_step1.png` });

  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 1000));
  console.log('Taking Onboarding Step 2 screenshot');
  await page.screenshot({ path: `${snippetsDir}/onboarding_step2.png` });

  await browser.close();
  
  // Dashboard screenshot
  const browser2 = await puppeteer.launch();
  const page2 = await browser2.newPage();
  await page2.setViewport({ width: 1280, height: 800 });
  await page2.setRequestInterception(true);
  
  page2.on('request', request => {
    if (request.url().includes('/api/config') && request.method() === 'GET') {
      request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ onboarding_complete: 'true' })
      });
    } else {
      request.continue();
    }
  });

  console.log('Navigating to Dashboard');
  await page2.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2000));
  console.log('Taking Dashboard screenshot');
  await page2.screenshot({ path: `${snippetsDir}/dashboard.png` });

  await browser2.close();
  console.log('Screenshots completed!');
})();
