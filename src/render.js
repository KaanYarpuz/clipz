const remote = require('@electron/remote');
const { writeFile } = require('fs');
const { ipcRenderer } = require('electron');
const { dialog, Menu } = remote;

const videoSelectBtn = document.getElementById('videoSelectBtn');
videoSelectBtn.onclick = getVideoSources;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const videoElement = document.getElementById('videoElement');
const frameRateSelect = document.getElementById('frameRateSelect');
const desktopAudioMeter = document.getElementById('desktopAudioMeter');
const desktopAudioLevel = document.getElementById('desktopAudioLevel');
const recordingTime = document.getElementById('recordingTime');

let mediaRecorder;
let currentStream;
const recordedChunks = [];
let startTime;
let timerInterval;

const desktopCapturer = {
    getSources: (opts) => ipcRenderer.invoke('DESKTOP_CAPTURER_GET_SOURCES', opts)
};

async function getVideoSources() {
    const inputSources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        audio: true,
    });

    const videoOptionsMenu = Menu.buildFromTemplate(
        inputSources.map(source => {
            return {
                label: source.name,
                click: () => selectSource(source)
            };
        })
    );

    videoOptionsMenu.popup();
}

async function selectSource(source) {
    videoSelectBtn.innerText = source.name;

    const frameRate = parseInt(frameRateSelect.value) || 10;

    const constraints = {
        audio: {
            mandatory: {
                chromeMediaSource: 'desktop'
            },
        },
        video: {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: source.id,
                maxFrameRate: frameRate,
                minFrameRate: frameRate 
            }
        }
    };

    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    currentStream = stream;

    videoElement.srcObject = stream;
    videoElement.play();

    const options = { mimeType: 'video/webm; codecs=vp8', videoBitsPerSecond: 1500000 };
    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = handleDataAvailable;
    mediaRecorder.onstop = handleStop;

    setupAudioMeters(stream);
}

startBtn.onclick = e => {
    recordedChunks.length = 0; 
    mediaRecorder.start(1000);
    startBtn.classList.add('is-danger');
    startBtn.innerText = 'Recording';
    startTime = Date.now();
    timerInterval = setInterval(updateRecordingTime, 1000);
};

stopBtn.onclick = e => {
    mediaRecorder.stop();
    startBtn.classList.remove('is-danger');
    startBtn.innerText = 'Start';
    clearInterval(timerInterval);
};

function handleDataAvailable(e) {
    if (e.data.size > 0) {
        recordedChunks.push(e.data);
    }
}

async function handleStop(e) {
    const blob = new Blob(recordedChunks, {
        type: 'video/webm; codecs=vp8'
    });

    const buffer = Buffer.from(await blob.arrayBuffer());

    const { filePath } = await dialog.showSaveDialog({
        buttonLabel: 'Save video',
        defaultPath: `vid-${Date.now()}.webm`
    });

    if (filePath) {
        writeFile(filePath, buffer, () => console.log('video saved successfully!'));
    }

    // Clear recorded chunks
    recordedChunks.length = 0;
}

async function setupAudioMeters(stream) {
    const audioContext = new AudioContext();
    const desktopAudioSource = audioContext.createMediaStreamSource(stream);

    const desktopAnalyser = audioContext.createAnalyser();

    desktopAudioSource.connect(desktopAnalyser);

    desktopAnalyser.fftSize = 32;

    const bufferLength = desktopAnalyser.frequencyBinCount;
    const desktopDataArray = new Uint8Array(bufferLength);

    function updateAudioMeters() {
        desktopAnalyser.getByteFrequencyData(desktopDataArray);

        const desktopVolume = desktopDataArray.reduce((a, b) => a + b, 0) / bufferLength;

        desktopAudioLevel.style.width = `${Math.min(desktopVolume / 2, 100)}%`;

        requestAnimationFrame(updateAudioMeters);
    }

    updateAudioMeters();
}


function updateRecordingTime() {
    const elapsedTime = Date.now() - startTime;
    const hours = String(Math.floor(elapsedTime / 3600000)).padStart(2, '0');
    const minutes = String(Math.floor((elapsedTime % 3600000) / 60000)).padStart(2, '0');
    const seconds = String(Math.floor((elapsedTime % 60000) / 1000)).padStart(2, '0');
    recordingTime.innerText = `${hours}:${minutes}:${seconds}`;
}
