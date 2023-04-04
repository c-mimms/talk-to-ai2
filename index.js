const { spawn, exec } = require('child_process');
const fs = require('fs');
const record = require('node-record-lpcm16');
const axios = require('axios');
const queryGpt = require('./gpt.js').queryGpt;

const ffmpeg = spawn('ffmpeg', ['-i', '-', '-af', 'silencedetect=n=-50dB:d=1', '-f', 'null', '-']);

let file;
let recording;
let audioStream;

const fileName = "audio";
let fileNum = 0;

const detectRecording = record.record({
    sampleRate: 20000,
    device: "BlackHole 16ch"
}).stream().pipe(ffmpeg.stdin);

function startRecording() {
    fileNum++;
    console.log(`Started new recording ${fileName}${fileNum}.wav`);
    file = fs.createWriteStream(`${fileName}${fileNum}.wav`, { encoding: 'binary' });
    recording = record.record({
        sampleRate: 20000,
        device: "BlackHole 16ch"
    });
    audioStream = recording.stream();
    audioStream.pipe(file);
}

function stopRecording() {
    audioStream.unpipe(file);
    audioStream.end();
    file.end();
    recording.stop();
}

function onSilenceDetected() {
    stopRecording();
    transcribeAudio(`${fileName}${fileNum}.wav`);
    startRecording();
}

function handleFFmpegOutput(data) {
    console.log(`${data}`);
    const lines = data.toString().split('\n');
    for (const line of lines) {
        if (line.includes('silence_start')) {
            onSilenceDetected();
            break;
        }
    }
}

function handleFFmpegClose(code) {
    console.log(`ffmpeg process exited with code ${code}`);
}

async function evaluateCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${ error }`);
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
    const command = `whisper ${filename} --model tiny.en --language English --fp16 False --output_dir ./trash`;
    const transcription = await evaluateCommand(command);
    const stripped = stripBrackets(transcription);
    console.log(stripped);
    // Send the message to ChatGPT API
    sendToChatGPT(stripped);
}

function init() {
    startRecording();
    ffmpeg.stderr.on('data', handleFFmpegOutput);
    ffmpeg.on('close', handleFFmpegClose);
}

const current_date =  new Date().toLocaleString();
const systemMsg = { 'role': 'system', 'content': `You are InterviewBot. Your primary directive is to output whatever you think would be most helpful to Chris, who is currently interviewing for a Senior Software engineering position at Square. Respond as briefly as possible. Current date: ${current_date}`};
var messageHistory = [];

async function sendToChatGPT(text) {
    var interviewerMessage = { 'role': 'user', 'content': text};
    messageHistory.push(interviewerMessage);
    var response = await queryGpt([systemMsg].concat(messageHistory));
    var userMessage = { 'role': 'assistant', 'content': response};
    messageHistory.push(userMessage);
    console.log(response);
}

init();
