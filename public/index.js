const socket = io();
const transcript = document.getElementById('transcript');
const systemMessageInput = document.getElementById('system-message');

function scrollToBottom(element) {
  element.scrollTop = element.scrollHeight;
}

function populateVoiceList() {
  const voiceSelect = document.getElementById('voiceSelect');
  const voices = window.speechSynthesis.getVoices();
  voices.forEach((voice) => {
    const option = document.createElement('option');
    option.textContent = voice.name;
    option.value = voice.name;
    voiceSelect.appendChild(option);
  });
}

function speakText(text) {
  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text);
  const voiceCheckbox = document.getElementById('voiceCheckbox');
  const voiceSelect = document.getElementById('voiceSelect');
  if (voiceCheckbox.checked) {
    const selectedVoiceName = voiceSelect.value;
    const voices = synth.getVoices();
    const selectedVoice = voices.find(voice => voice.name === selectedVoiceName);
    utterance.voice = selectedVoice;
  }
  synth.speak(utterance);
}

systemMessageInput.addEventListener('change', () => {
  socket.emit('changeSystemMsg', systemMessageInput.value);
});

const customCheckbox = document.getElementById('customCheckbox');
const voiceCheckbox = document.getElementById('voiceCheckbox');
const voiceSelect = document.getElementById('voiceSelect');
customCheckbox.addEventListener('click', () => {
  voiceCheckbox.checked = !voiceCheckbox.checked;
  customCheckbox.classList.toggle('checked', voiceCheckbox.checked);
  voiceSelect.style.display = voiceCheckbox.checked ? 'block' : 'none';
});

function autoResize(element) {
  element.style.height = 'auto';
  element.style.height = (element.scrollHeight) + 'px';
  var viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

  var transcript = document.getElementById("transcript");
  var maxHeight = viewportHeight - element.offsetHeight - 40;
  transcript.style.maxHeight = maxHeight + "px";
  transcript.style.overflowY = "scroll";
}

systemMessageInput.addEventListener('input', () => {
  autoResize(systemMessageInput);
});
autoResize(systemMessageInput);

var lastResponse = document.createElement('p');
transcript.appendChild(lastResponse);

socket.on('append', (data) =>{
  if(data === "ENDING"){
    lastResponse = document.createElement('p');
    transcript.appendChild(lastResponse);
  } else {
    lastResponse.textContent = lastResponse.textContent + data;
  }
  scrollToBottom(transcript);
});

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.lang = 'en-US';
recognition.interimResults = false;
recognition.maxAlternatives = 1;

recognition.onresult = (event) => {
  const speechResult = event.results[0][0].transcript;
  socket.emit('speechResult', speechResult);
};

recognition.onerror = (event) => {
  console.error('Speech recognition error:', event.error);
};

recognition.onend = () => {
  recognition.start();
};

socket.on('update', (messageHistory) => {
  transcript.innerHTML = '';

  messageHistory.forEach(message => {
    const messageElement = document.createElement('p');
    messageElement.textContent = `${message.role}: ${message.content}`;
    transcript.appendChild(messageElement);
  });

  const lastMessage = messageHistory[messageHistory.length - 1];

  if (lastMessage && lastMessage.role === 'assistant') {
    speakText(lastMessage.content);
  }

  scrollToBottom(transcript);
});

populateVoiceList();
window.speechSynthesis.onvoiceschanged = populateVoiceList;

recognition.start();
