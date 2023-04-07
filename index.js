import { spawn, exec } from 'child_process';
import fs from 'fs';
import record from 'node-record-lpcm16';
import 'axios';
import { streamGpt } from './gpt.js';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

var messageHistory = [];

class AudioRecorder {
    constructor(device) {
        console.log(device);
        this.device = device;
        this.fileName = "audio";
        this.fileNum = 0;
        this.file = null;
        this.recording = null;
        this.audioStream = null;
        this.ffmpeg = spawn('ffmpeg', ['-i', '-', '-af', 'silencedetect=n=-20dB:d=1', '-f', 'null', '-']);
    }

    init() {
        this.ffmpeg.stderr.on('data', this.handleFFmpegOutput.bind(this));
        this.detectRecording = record.record({
            sampleRate: 16000,
            device: this.device
        }).stream().pipe(this.ffmpeg.stdin);
        this.startRecording();
    }

    startRecording() {
        this.fileNum++;
        this.file = fs.createWriteStream(`${this.fileName}${this.fileNum}_${this.device}.wav`, { encoding: 'binary' });
        this.recording = record.record({
            sampleRate: 16000,
            verbose: true,
            device: this.device
        });
        this.audioStream = this.recording.stream();
        this.audioStream.pipe(this.file);
    }

    stopRecording() {
        this.audioStream.unpipe(this.file);
        this.audioStream.end();
        this.file.end();
        this.recording.stop();
    }

    async onSilenceDetected() {
        this.stopRecording();
        this.startRecording();
        transcribeAudio(`${this.fileName}${this.fileNum - 1}_${this.device}.wav`);
    }

    handleFFmpegOutput(data) {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.includes('silence_start')) {
                this.onSilenceDetected();
                break;
            }
        }
    }
}

async function evaluateCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                reject(error);
            } else {
                resolve(stdout.trim());
            }
        });
    });
}

function stripBrackets(line) {
    return line.toString().replace(/\[.*\]/g, '').replace(/\n/g, ' ');
}

async function transcribeAudio(filename) {
    const command = `whisper "${filename}" --model tiny.en --language English --fp16 False --output_dir ./trash`;
    const transcription = await evaluateCommand(command);
    const strippedMessage = stripBrackets(transcription);
    if (strippedMessage.length > 5) {
        updateMessageHistory(strippedMessage);
    }
}

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

//Start listening to default audio input
var devRec = new AudioRecorder("default");
devRec.init();

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
    var response = null;
    socket.emit('update', messageHistory);

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
