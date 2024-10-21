const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
let mainWindow;

function createWindow () {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, '/icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  // Load your express app in the Electron window
  mainWindow.loadURL('http://localhost:3000');

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
  
}

app.on('ready', createWindow);

// Define the log file path (use app.getPath to ensure it's writable in production)
function logError(message) {
  const logDir = app.getPath('userData');  // App's user data directory
  const logFilePath = path.join(logDir, 'error-log.txt');
  
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] ${message}\n`;
  // Append the error message to the log file
  fs.appendFile(logFilePath, formattedMessage, (err) => {
    if (err) {
      console.error('Failed to write to log file', err);
    }
  });
}

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});


const puppeteer = require('puppeteer');
const NodePdfPrinter = require('node-pdf-printer');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const cors = require('cors');

const server = express();
const port = 3000;
server.use(express.json());
server.use(express.urlencoded({ extended: true }));
server.use(cors());

const severURL = 'http://localhost:10004';
const minimeURL = 'http://localhost:8300';

let loggedUserId = '';
let loggedPassword = '';
let loggedTimezone = '';

// WebSocket client setup
const wss = new WebSocket('wss://mahbubpc.ezassist.me:10005/');

wss.on('open', () => {
  console.log('Connected to WebSocket server');
  wss.send(JSON.stringify({
    event: "register", data: { id: uuidv4() }
  }));

  wss.on('message', message => {
    const data = JSON.parse(message);
    //console.log(`Received message: ${data.target}`);
    //logError(`Received message: ${JSON.stringify(data.notes)}`);
    if (data.target === 'updateOrder') {
      //console.log(`Received message: ${JSON.stringify(data.notes)}`);
      handleOrderUpdatePrint(data.notes.evt.orderNo);
    }
    else if (data.target === 'singleOrderPrint') {
      handleSingleOrderPrint(data.notes.orderId, data.notes.kitchenId);
    }
  });

  // close 
  wss.on('close', () => {
    console.log('Client disconnected');
    setTimeout(() => {
      console.log('Reconnecting to WebSocket server');
      wss = new WebSocket('wss://mahbubpc.ezassist.me:10005/');
    }, 3000);
  });
});  


// listen a local port and automatically open the browser a html page with login form
server.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);
});

// Set up static folder for Express to serve
const publicPath = path.join(__dirname, 'public');
server.use(express.static(publicPath));

server.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

server.post('/login', (req, res) => {
  const { userId, password, timezone } = req.body;
  
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
        loggedTimezone = timezone;
        res.redirect('/dashboard');
      }
      else if(response.url.includes('msg')) {
        // Parse the URL
        const parsedUrl = new URL(response.url);

        // Extract the 'msg' parameter
        const errorMsg = parsedUrl.searchParams.get('msg');
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
server.get('/dashboard', (req, res) => {
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
  res.sendFile(path.join(publicPath, 'dashboard.html'));
});

// get printer list from pc
server.get('/printers', async(req, res) => {
  const printers = await NodePdfPrinter.listPrinter('en-US');
  res.json(printers);
});

//=const chromiumPath = path.join(__dirname, 'chrome-win', 'chrome.exe'); // Adjust path if needed
async function printInvoice(invoiceUrl, printer) {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      //executablePath: getChromiumExecutablePath(), 
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(invoiceUrl, { waitUntil: 'networkidle2' });

    const pdfPath = path.join(app.getPath('userData'), `invoice${new Date().getTime()}.pdf`);
    logError(`invoice pdf path: ${pdfPath}`);
    await page.pdf({
      path: pdfPath,
      width: '76mm',
      printBackground: true,
      margin: { top: '2mm', bottom: '2mm', left: '2mm', right: '2mm' }
    });

    await browser.close();
    logError(`Browser closed`);
    // Print the PDF file
    NodePdfPrinter.printFiles([pdfPath], printer);
    handleKitchenPrinter('Success');
  } catch (error) {
    // Log the error to file
    logError(`Error while printing invoice: ${error.stack}`);
    console.error('Print failed', error);
  }
}

// Print the invoice
function printPfdInvoice(filePath, printer) {
  switch (process.platform) {
    case 'darwin':
    case 'linux':
        ch.exec(
            'lp ' + filePath, (e) => {
                if (e) {
                    throw e;
                }
            });
        break;
    case 'win32':
        ch.exec(
            'ptp ' + pdf.filename, {
                windowsHide: true
            }, (e) => {
                if (e) {
                    throw e;
                }
            });
        break;
    default:
        throw new Error(
            'Platform not supported.'
        );
  }
}

var kitchenPrinterQue = [];
function handleOrderUpdatePrint(orderId){
  //console.log('Order update received: '+orderId);
  fetch(minimeURL+"/ws/getorderdetailsinfo?orderId=" + orderId, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  }).then(response => {
    return response.json();
  }).then(data => {
    const wsOrderData = data[0];
    //console.log(wsOrderData);
    if (wsOrderData.lastActivity == 'Received') {
      let kitchens;
      try {
        kitchens = JSON.parse(wsOrderData.kitchens);
      } catch (err) {
        kitchens = wsOrderData.kitchens;
      }
      for (let i = 0; i < kitchens.length; i++) {
          if (kitchens[i].printerId == null || kitchens[i].printerId == '') continue;

          let url;
          if (kitchens[i].invoice == 'Kitchen Token') {
              url = minimeURL+'/get-kitchen-invoice?orderId=' + orderId + '&kitchenId=' + kitchens[i].kitchenId + '&timeZone=' + loggedTimezone;
          }
          else {
              url = minimeURL+ '/pos-80?orderId=' + orderId + '&kitchenId=' + kitchens[i].kitchenId + '&timeZone=' + loggedTimezone;
          }

          const notes = {
              url: url, printer: kitchens[i].printerId, kitchenId: kitchens[i].kitchenId, orderNo: orderId, myId: wsOrderData.myId
          };
          logError(`kitchenPrinterQue: ${JSON.stringify(notes)}`);
          kitchenPrinterQue.push(notes);
      }
      handleKitchenPrinter('Print');
  }
  }).catch(error => {
    console.error("Error "+error);
  });
}

function handleKitchenPrinter(event) {
  //console.log('handleKithcenPrinter: '+event);
  switch (event) {
      case 'Print':
        if (kitchenPrinterQue.length>0) {
          printInvoice(kitchenPrinterQue[0].url, kitchenPrinterQue[0].printer, kitchenPrinterQue[0].myId, kitchenPrinterQue[0].kitchenId);
        }
          break;
      case 'Success':
          kitchenPrinterQue.shift();
          if (kitchenPrinterQue.length>0) {
              handleKitchenPrinter('Print');
          }
          break;
      case 'Error':
          kitchenPrinterQue.shift();
          if (kitchenPrinterQue.length>0) {
              handleKitchenPrinter('Print');
          }
          break;
      default:
          break;
  }
}

function handleSingleOrderPrint(orderId, kitchenId) {
  //console.log('Order update received: '+orderId + ' kitchenId: '+kitchenId);
  fetch(minimeURL+"/ws/getorderdetailsinfo?orderId=" + orderId, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  }).then(response => {
    return response.json();
  }).then(data => {
    const wsOrderData = data[0];    
    let kitchens;
    try {
      kitchens = JSON.parse(wsOrderData.kitchens);
    } catch (err) {
      kitchens = wsOrderData.kitchens;
    }
    for (let i = 0; i < kitchens.length; i++) {
      if (kitchens[i].kitchenId != kitchenId) continue;
      if (kitchens[i].printerId == null || kitchens[i].printerId == '') continue;
      
      let url;
      if (kitchens[i].invoice == 'Kitchen Token') {
          url = minimeURL+'/get-kitchen-invoice?orderId=' + orderId + '&kitchenId=' + kitchens[i].kitchenId + '&timeZone=' + loggedTimezone;
      }
      else {
          url = minimeURL+ '/pos-80?orderId=' + orderId + '&kitchenId=' + kitchens[i].kitchenId + '&timeZone=' + loggedTimezone;
      }

      const notes = {
          url: url, printer: kitchens[i].printerId, kitchenId: kitchens[i].kitchenId, orderNo: orderId, myId: wsOrderData.myId
      };
      logError(`Print Single Token: ${JSON.stringify(notes)}`);
      kitchenPrinterQue.push(notes);
  }
  handleKitchenPrinter('Print');
  
  }).catch(error => {
    console.error("Error "+error);
  });
}
