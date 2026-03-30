import {
    getPixels,
    transform,
    genPasses,
    removeAlpha,
    getPasswordVariation32
} from './NoImageDNA.js';

const imagePreInput = document.getElementById("imagePre");
const statusDiv = document.getElementById("compareStatus");
const passwordsRefreshButton = document.getElementById("refreshPasses");

const MESSAGES = {
    "success": "SHA-256 Hashes match, no data has been lost",
    "fail": "SHA-256 Hashes do not match, data may be degraded/corrupted"
}

var passes = [];

256
async function sha256(uint8Array) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array.buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function processImages(e) {
    const file = e.target.files[0];
    if (!file) return;

    const canvasOrig = document.getElementById('canvasOrig');
    const canvasEnc = document.getElementById('canvasEnc');
    const canvasEncFullAlpha = document.getElementById('canvasEncFullAlpha');
    const canvasDec = document.getElementById('canvasDec');

    const ctxOrig = canvasOrig.getContext('2d');
    const ctxEnc = canvasEnc.getContext('2d');
    const ctxEncFullAlpha = canvasEncFullAlpha.getContext('2d');
    const ctxDec = canvasDec.getContext('2d');

    // Load the Image File onto the first Canvas
    const img = new Image();
    img.src = URL.createObjectURL(file);

    await new Promise((resolve) => {
        img.onload = () => {
            canvasOrig.width = img.width;
            canvasOrig.height = img.height;
            ctxOrig.drawImage(img, 0, 0);
            resolve();
        };
    });

    // 2. Extract pixels
    const originalPixels = getPixels(canvasOrig);
    const hash1 = await sha256(originalPixels);
    document.getElementById('hashOrig').textContent = `Hash: ${hash1}`;

    const encryptedPixels = transform(originalPixels, canvasOrig.width, canvasOrig.height, false, passes.length !== 0 ? passes : undefined);

    canvasEnc.width = canvasOrig.width;
    canvasEnc.height = canvasOrig.height;
    ctxEnc.putImageData(new ImageData(encryptedPixels, canvasEnc.width, canvasEnc.height), 0, 0);
    
    canvasEncFullAlpha.width = canvasOrig.width;
    canvasEncFullAlpha.height = canvasOrig.height;
    ctxEncFullAlpha.putImageData(new ImageData(removeAlpha(encryptedPixels), canvasEncFullAlpha.width, canvasEncFullAlpha.height),0 ,0);

    const hash2 = await sha256(encryptedPixels);
    document.getElementById('hashEnc').textContent = `Hash: ${hash2}`;

    //  Decrypt 
    const decryptedPixels = transform(encryptedPixels, canvasOrig.width, canvasOrig.height, true, passes.length !== 0 ? passes : undefined);

    canvasDec.width = canvasOrig.width;
    canvasDec.height = canvasOrig.height;
    ctxDec.putImageData(new ImageData(decryptedPixels, canvasDec.width, canvasDec.height), 0, 0);

    const hash3 = await sha256(decryptedPixels);
    document.getElementById('hashDec').textContent = `Hash: ${hash3}`;

    const statusDiv = document.getElementById("compareStatus");
    statusDiv.style.display = "block";
    if (hash1 === hash3) {
        statusDiv.textContent = MESSAGES.success;
        statusDiv.className = "status match";
    } else {
        statusDiv.textContent = MESSAGES.fail;
        statusDiv.className = "status mismatch";
    }
}

/*
  * Event Listeners
  * */

imagePreInput.addEventListener('change', processImages);
refreshPasses.onclick = function() {
    passes = genPasses(document.getElementById("numPasses").value);
    console.log(passes)
}
