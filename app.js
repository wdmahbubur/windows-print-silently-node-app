const puppeteer = require('puppeteer');

puppeteer
  .launch()
  .then(browser => {
    console.log('Chromium successfully downloaded');
    return browser.close();
  })
  .catch(err => console.error('Error downloading Chromium:', err));
