const { spawn, exec } = require('child_process');
const fs = require('fs');
const record = require('node-record-lpcm16');
const axios = require('axios');
const queryGpt = require('./gpt.js').queryGpt;


const devices = ["BlackHole 16ch", "default"];

class AudioRecorder {
    constructor(device) {
        console.log(device);
        this.device = device;
        this.fileName = "audio";
        this.fileNum = 0;
        this.file = null;
        this.recording = null;
        this.audioStream = null;
        if (device === "BlackHole 16ch") {
            this.ffmpeg = spawn('ffmpeg', ['-i', '-', '-af', 'silencedetect=n=-50dB:d=1', '-f', 'null', '-']);
        } else {
            this.ffmpeg = spawn('ffmpeg', ['-i', '-', '-af', 'silencedetect=n=-30dB:d=1', '-f', 'null', '-']);
        }
    }

    init() {
        this.ffmpeg.stderr.on('data', this.handleFFmpegOutput.bind(this));
        this.ffmpeg.on('close', this.handleFFmpegClose.bind(this));
        this.detectRecording = record.record({
            sampleRate: 16000,
            device: this.device
        }).stream().pipe(this.ffmpeg.stdin);
        this.startRecording();
    }

    startRecording() {
        this.fileNum++;
        console.log(`Started new recording ${this.fileName}${this.fileNum}_${this.device}.wav`);
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
        transcribeAudio(this.device, `${this.fileName}${this.fileNum - 1}_${this.device}.wav`);
    }

    handleFFmpegOutput(data) {
        if (this.device === "BlackHole 16ch") {
            console.log(`Output : ${data}`);
        }
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.includes('silence_start')) {
                this.onSilenceDetected();
                break;
            }
        }
    }

    handleFFmpegClose(code) {
        console.log(`ffmpeg process exited with code ${code}`);
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

async function transcribeAudio(device, filename) {
    const command = `whisper "${filename}" --model tiny.en --language English --fp16 False --output_dir ./trash`;
    const transcription = await evaluateCommand(command);
    const stripped = stripBrackets(transcription);
    console.log(`${device} :  ${stripped}`);
    storeMessage(device, stripped);
}

function storeMessage(device, message) {
    updateMessageHistory(device, message);
}

var messageHistory = [];
var messageHistoryHuman = [];


function updateMessageHistory(device, message) {
    let messageEntry;
    if (device === "BlackHole 16ch") {
        messageEntry = { 'role': 'user', 'name': 'Interviewer', 'content': message };
        messageHistory.push(messageEntry);
        messageHistoryHuman.push(messageEntry);
        sendToChatGPT();
    } else {
        messageEntry = { 'role': 'user', 'name': 'Chris', 'content': message };
        messageHistoryHuman.push(messageEntry);
    }

    console.log("Updating");
    // Emit the updated messageHistory to all connected clients
    io.emit('update', { messageHistoryHuman, responseHistory });
}

// Create an array to store the history of responses from queryGpt
const responseHistory = [];

function updateResponseHistory(response) {
    // Add the response to the response history
    responseHistory.unshift(response);

    // Emit the updated responseHistory to all connected clients
    io.emit('update', { messageHistoryHuman, responseHistory });
}

async function sendToChatGPT() {
    var response = await queryGpt([systemMsg].concat(messageHistory));
    console.log(response);
    responseEntry = { 'role': 'assistant', 'content': response };
    messageHistory.push(responseEntry);
    updateResponseHistory(response);
}

const current_date = new Date().toLocaleString();
// const systemMsg = { 'role': 'system', 'content': `You are InterviewBot. You output whatever would be most helpful to Chris, who is currently interviewing for a Senior Software engineering position at Square. A voice to text transcript of the meeting is included below. The transcript is imperfect so you will need to make inferences. General interview advice is not needed. Instead, focus on answering the questions that the interviewer asks Chris, or adding on to his response. Respond as briefly as possible and repond only with "_" until the most recent message is finished. Current date: ${current_date}` };
const systemMsg = { 'role': 'system', 'content': `You are InterviewBot, currently in a system architecture interview for a Senior Software engineering position at Square. A voice to text transcript of the meeting is included below. The transcript is imperfect so you will need to make inferences. Focus on answering the questions that the interviewer asks. Respond as concisely as possible and repond only with "_" if it seems like the interview has not finished talking yet. Current date: ${current_date}` };

function main() {
    devices.forEach(device => {
        var devRec = new AudioRecorder(device);
        devRec.init();
    });
}

main();

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

// Create an express app
const app = express();

// Create an HTTP server using the express app
const server = http.createServer(app);

// Create a socket.io server attached to the HTTP server
const io = socketIO(server);

// Serve the static files (HTML, CSS, JS) from the "public" directory
app.use(express.static('public'));

// Define a route to serve the web page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Listen for socket.io connections
io.on('connection', (socket) => {
    console.log('A user connected');

    // Send the initial messageHistory and response to the connected client
    var response = null;
    socket.emit('update', { messageHistoryHuman, responseHistory });

    // Listen for disconnection
    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

// Start the server on port 3000
server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
