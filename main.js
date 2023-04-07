import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { streamGpt } from './gpt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

var messageHistory = [];

function updateMessageHistory(message) {
  let messageEntry = { 'role': 'user', 'content': message };
  messageHistory.push(messageEntry);
  sendToChatGPT();

  // Emit the updated messageHistory to all connected clients
  io.emit('update', messageHistory);
}

// Create an array to store the history of responses from queryGpt
const responseHistory = [];

async function sendToChatGPT() {
    var messages = [systemMsg].concat(messageHistory);
    var response = '';
    streamGpt(messages, (data) => {
        io.emit('append', data);
        response = response + data;
    }).then(() => {
        io.emit('append', 'ENDING');
        messageHistory.push({ 'role': 'assistant', 'content': response });
        responseHistory.push(response);
        io.emit('update', messageHistory);
    });
}

const current_date = new Date().toLocaleString();
const systemMsg = { 'role': 'system', 'content': `You are VoiceGPT, a voice powered assistant. Current date: ${current_date}` };

// Create an express app
const app = express();
app.use(express.static('public'));

// Create a socket.io server attached to the HTTP server
const server = http.createServer(app);
const io = new Server(server);

// Define a route to serve the web page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Listen for socket.io connections
io.on('connection', (socket) => {
  console.log('A user connected');

  // Send the initial messageHistory and response to the connected client
  socket.emit('update', messageHistory);

  // Listen for speech recognition results from the client
  socket.on('speechResult', (speechResult) => {
    updateMessageHistory(speechResult);
  });

  // Listen for disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });

  socket.on('changeSystemMsg', (newSystemMsg) => {
    systemMsg.content = newSystemMsg;
  });
});

// Start the server on port 3000
server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
