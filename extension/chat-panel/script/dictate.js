const micButton = document.getElementById('micButton');

let isRecording = false;
let recognition = null;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onresult = (event) => {
    let interim = '';
    let finalText = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += transcript + ' ';
      else interim += transcript;
    }
    chatInput.value = finalText + interim;
  };

  recognition.onerror = (e) => {
    console.error('Speech error:', e);
    stopRecording();
  };
}

micButton.addEventListener('click', () => {
  if (!recognition) {
    alert('Speech recognition not supported in your browser.');
    return;
  }
  if (isRecording) stopRecording();
  else startRecording();
});

function startRecording() {
  isRecording = true;
  micButton.classList.add('recording');
  recognition.start();
}

function stopRecording() {
  isRecording = false;
  micButton.classList.remove('recording');
  recognition.stop();
}