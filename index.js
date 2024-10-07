import puppeteer from 'puppeteer';
import NodePdfPrinter from 'node-pdf-printer';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import open from 'open';
import express from 'express';
import cors from 'cors';

const app = express();
const port = 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const severURL = 'http://localhost:10004';

let loggedUserId = '';
let loggedPassword = '';

// __dirname is not defined in ES module scope
// Use the following workaround to get the current directory
const __dirname =  path.resolve(path.dirname('')); // path.resolve(path.dirname(''));

// WebSocket client setup
const wss = new WebSocket('wss://mahbubpc.ezassist.me:10005/');

wss.on('open', () => {
  console.log('Connected to WebSocket server');
  wss.send(JSON.stringify({
    event: "register", data: { id: uuidv4() }
  }));

  wss.on('message', message => {
    //console.log(`Received message: ${message}`);
    const data = JSON.parse(message);
    if (data.target === 'invoice') {
      //console.log(`Received message: ${data.notes.data}`);
      printInvoice(data.notes.data);
    }
  });

  // close 
  wss.on('close', () => {
    console.log('Client disconnected');
  });
});  


// listen a local port and automatically open the browser a html page with login form
app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);
  // Open the login page in the default browser
  //await open(`http://localhost:${port}`);
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// get public folder as static
app.use(express.static('public'));

app.post('/login', (req, res) => {
  const { userId, password } = req.body;
  
  const body = {
    authType: '',
    userid : userId,
    password : password,
    redirURL: 'http://localhost:3000/dashboard',
    firebaseToken: '',
    deviceId: '',
    nfaCode: ''
  }
  // send login request to the server
  fetch(severURL+'/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  }).then(response => {
    
    if (response.ok) {
      if ((response.url.includes(port) || response.url.includes('dashboard')) && !response.url.includes('msg')) {
        console.log('redirect to dashboard');
        loggedUserId = userId;
        loggedPassword = password;
        res.redirect('/dashboard');
      }
      else if(response.url.includes('msg')) {
        // Parse the URL
        const parsedUrl = new URL(response.url);

        // Extract the 'msg' parameter
        const errorMsg = parsedUrl.searchParams.get('msg');
        //console.log('redirect to login page with error: '+errorMsg);
        res.redirect('/?error='+errorMsg);
      }
      else {
        console.log('redirect to login page');
        res.redirect('/?error=Invalid credentials');
      }
    }
  }).catch(error => { 
    //console.error("Error "+error);
    res.redirect('/?error='+error.message);
  });

});

// Dashboard page
app.get('/dashboard', (req, res) => {
  if (loggedUserId=='') {
    return res.redirect('/');
  }

  wss.send(JSON.stringify({
    event: "tagUser", data: { id: loggedUserId, partnerId: loggedUserId, userName: '', profilePic: '', authType: 'email' }
  }));

  // get page list from the server
  fetch(severURL+'/ws/showUserPages?userid='+loggedUserId, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  }).then(response => {
    return response.json();
  }).then(data => {
    const pages = [];
    data[0].map(page => pages.push({id: page.pageid}))

    wss.send(JSON.stringify({event: "updateSubscription", data: pages}));

  }).catch(error => { 
    console.error("Error "+error);
  }); 
  res.sendFile(__dirname + '/public/dashboard.html');
});

// get printer list from pc
app.get('/printers', async(req, res) => {
  const printers = await NodePdfPrinter.listPrinter('en-US');
  res.json(printers);
});

//const chromiumPath = path.join(__dirname, 'chrome-win', 'chrome.exe'); // Adjust path if needed
async function printInvoice(invoiceUrl) {
  try {
    // Launch headless browser to fetch the invoice from the URL
    const browser = await puppeteer.launch({
      headless: true,
      //executablePath: chromiumPath, // Specify the bundled Chromium path
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

    const array = [
        pdfPath
    ];

    NodePdfPrinter.printFiles(array, 'POS-80C');

    //Optionally, remove the temporary PDF file
    //fs.unlinkSync(pdfPath);
  } catch (error) {
    wss.send(JSON.stringify({
      event: "invoice", data: { status: 'error', message: error.message }
    }));
  }
}

// Example usage
//const invoiceUrl = 'https://minimews.sharedtoday.com/pos-80?orderId=2165742&timeZone=Asia/Dhaka';
//printInvoice(invoiceUrl);


