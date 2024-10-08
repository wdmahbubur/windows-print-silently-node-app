const { app, BrowserWindow } = require('electron');
const path = require('path');
require('./index');  // This will run your existing express server.

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
