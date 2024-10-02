const puppeteer = require('puppeteer');
const NodePdfPrinter = require('node-pdf-printer');
const fs = require('fs');
const path = require('path');
const { WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');
const chromiumPath = path.join(__dirname, 'chrome-win', 'chrome.exe'); // Adjust path if needed
async function printInvoice(invoiceUrl) {
  try {
    // Launch headless browser to fetch the invoice from the URL
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: chromiumPath, // Specify the bundled Chromium path
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Go to the invoice URL
    await page.goto(invoiceUrl, { waitUntil: 'networkidle2' });

    // Generate a temporary PDF file of the invoice
    const pdfPath = path.join(__dirname, 'invoice.pdf');
    await page.pdf({ path: pdfPath, width: '76mm', printBackground: true , margin: {
        top: '2mm',
        bottom: '2mm',
        left: '2mm',
        right: '2mm'
    }});

    // Close the browser
    await browser.close();

    // Read the generated PDF
    const pdfData = fs.readFileSync(pdfPath);

    const array = [
        pdfPath
    ];

    NodePdfPrinter.printFiles(array, 'POS-80C');

    //Optionally, remove the temporary PDF file
    //fs.unlinkSync(pdfPath);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Example usage
//const invoiceUrl = 'https://minimews.sharedtoday.com/pos-80?orderId=2165742&timeZone=Asia/Dhaka';
//printInvoice(invoiceUrl);


// WebSocket server setup
const wss = new WebSocket('wss://mahbubpc.ezassist.me:10005/');


wss.on('open', () => {
  console.log('Connected to WebSocket server');
  wss.send(JSON.stringify({
    event: "register", data: { id: uuidv4() }
  }));

  wss.on('message', message => {
    console.log(`Received message: ${message}`);
    const data = JSON.parse(message);
    if (data.event === 'invoice') {
      printInvoice(data.data.url);
    }
  });

  wss.send(JSON.stringify({
    event: "tagUser", data: { id: 'lct786973@gmail.com', partnerId: 'lct786973@gmail.com', userName: 'Mahbub', profilePic: '', authType: 'email' }
  }));

  wss.send(JSON.stringify({event: "supdateSubscription", data: [{id: "waltonspice_kazishopik4@gmail.com"}]}));

  // close 
  wss.on('close', () => {
    console.log('Client disconnected');
  });
});



// wss.on('connection', ws => {
//   console.log('Client connected');

//   // Listen for messages from clients
//   ws.on('message', message => {
//     console.log(`Received message: ${message}`);

//     try {
//       const data = JSON.parse(message);

//       // Check if it's an invoice link and call the print function
//       if (data.type === 'invoice' && data.url) {
//         printInvoice(data.url);
//       }
//     } catch (error) {
//       console.error('Invalid message format:', error.message);
//     }
//   });

//   // Handle disconnection
//   ws.on('close', () => {
//     console.log('Client disconnected');
//   });
// });
  