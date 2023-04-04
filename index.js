const { spawn, exec } = require('child_process');
const fs = require('fs');
const record = require('node-record-lpcm16');
const axios = require('axios');
const queryGpt = require('./gpt.js').queryGpt;


const ffmpeg = spawn('ffmpeg', ['-i', '-', '-af', 'silencedetect=n=-50dB:d=1', '-f', 'null', '-']);

var file;
var recording;
var audioStream;

var fileName = "audio";
var fileNum = 0;

var detectRecording = record.record({
        sampleRate: 20000,
        device: "BlackHole 16ch"
    }).stream().pipe(ffmpeg.stdin);

// var micRecording = record.record({
//         sampleRate: 20000,
//         device: "MacBook Pro Microphone"
//     }).stream().pipe(ffmpeg.stdin);

function startRecording() {
    fileNum ++;
    console.log(`Started new recording ${fileName}${fileNum}.wav`);
    file = fs.createWriteStream(`${fileName}${fileNum}.wav`, { encoding: 'binary' });
    recording = record.record({
            sampleRate: 20000,
            device: "BlackHole 16ch"
        });
    audioStream = recording.stream();
    audioStream.pipe(file)
}

startRecording();

ffmpeg.stderr.on('data', (data) => {
    console.log(`${data}`);
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (line.includes('silence_start')) {
        //Stop current recording and start a new one
        audioStream.unpipe(file);
        audioStream.end();
        file.end();
        recording.stop();

        //Send file to whisper
        transcribeAudio(`${fileName}${fileNum}.wav`);

        //Start new recording
        startRecording();
        break;
      }
    }
  });

  ffmpeg.on('close', (code) => {
    console.log(`ffmpeg process exited with code ${code}`);
  });


function evaluateCommand(command) {
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

const current_date =  new Date().toLocaleString();
const systemMsg = { 'role': 'system', 'content': `You are InterviewBot. Your primary directive is to output whatever you think would be most helpful to Chris, who is currently interviewing for a Senior Software engineering position at Square. Current date: ${current_date}`};
var messageHistory = [];

async function sendToChatGPT(text) {
    var interviewerMessage = { 'role': 'user', 'content': text};
    messageHistory.push(interviewerMessage);
    var response = await queryGpt([systemMsg].concat(messageHistory));
    var userMessage = { 'role': 'assistant', 'content': response};
    messageHistory.push(userMessage);
    console.log(response);
}

function stripBrackets(line) {
    return line.toString().replace(/\[.*\]/g, '').replace(/\n/g, ' ');
}

function transcribeAudio(filename){
    // Use Whisper to transcribe the audio
    const command = `whisper ${filename} --model tiny.en --language English --fp16 False --output_dir ./trash`;
    console.log
    evaluateCommand(command).then(transcription => {
        var stripped = stripBrackets(transcription);
        console.log(stripped);
        // Send the message to ChatGPT API
        sendToChatGPT(stripped);
    });
}
