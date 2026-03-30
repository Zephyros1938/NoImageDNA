import {
    getPixels,
    transform,
    genPasses,
    removeAlpha,
    getPasswordVariation32,
    getVisualFingerprint,
    getHammingDistance
} from './NoImageDNA.js';

const imagePreInput = document.getElementById("imagePre");
const statusDiv = document.getElementById("compareStatus");
const passwordsRefreshButton = document.getElementById("refreshPasses");
const passwordsDisplayList = document.getElementById("passes");
const pHashSizeInput = document.getElementById("pHashSize");

const MESSAGES = {
    "success": "SHA-256 Hashes match, no data has been lost",
    "fail": "SHA-256 Hashes do not match, data may be degraded/corrupted",
    "closenessWarn": "SHA-256 Hashes match, but distance of pHashes under 30"
}

var passes = [];
var pHashSize = 16;

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
    const pHash1 = await getVisualFingerprint(canvasOrig, pHashSize);
    document.getElementById('hashOrig').textContent = `Hash: ${hash1}`;
    document.getElementById('pHashOrig').textContent = `pHash: ${parseInt(pHash1, 2).toString(16)}`;

    const encryptedPixels = transform(originalPixels, canvasOrig.width, canvasOrig.height, false, passes.length !== 0 ? passes : undefined);

    canvasEnc.width = canvasOrig.width;
    canvasEnc.height = canvasOrig.height;
    ctxEnc.putImageData(new ImageData(encryptedPixels, canvasEnc.width, canvasEnc.height), 0, 0);
    
    canvasEncFullAlpha.width = canvasOrig.width;
    canvasEncFullAlpha.height = canvasOrig.height;
    ctxEncFullAlpha.putImageData(new ImageData(removeAlpha(encryptedPixels), canvasEncFullAlpha.width, canvasEncFullAlpha.height),0 ,0);

    const hash2 = await sha256(encryptedPixels);
    const pHash2 = await getVisualFingerprint(canvasEnc, pHashSize);
    document.getElementById('hashEnc').textContent = `Hash: ${hash2}`;
    document.getElementById('pHashEnc').textContent = `pHash: ${parseInt(pHash2, 2).toString(16)}`;

    //  Decrypt 
    const decryptedPixels = transform(encryptedPixels, canvasOrig.width, canvasOrig.height, true, passes.length !== 0 ? passes : undefined);

    canvasDec.width = canvasOrig.width;
    canvasDec.height = canvasOrig.height;
    ctxDec.putImageData(new ImageData(decryptedPixels, canvasDec.width, canvasDec.height), 0, 0);

    const hash3 = await sha256(decryptedPixels);
    document.getElementById('hashDec').textContent = `Hash: ${hash3}`;

    const statusDiv = document.getElementById("compareStatus");
    statusDiv.style.display = "block";
    let hammingDistance = getHammingDistance(pHash1, pHash2);
    document.getElementById("pHashHammingDistance").innerText = hammingDistance/(pHashSize*pHashSize);
    if (hash1 === hash3) {
        if (hammingDistance < 30) {
      statusDiv.textContent = MESSAGES.closenessWarn;
      statusDiv.className = "status closenessWarn";
    } else {
        statusDiv.textContent = MESSAGES.success;
        statusDiv.className = "status match";}
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
    const numPasses = document.getElementById("numPasses").value;
    passes = genPasses(numPasses);
    
    passwordsDisplayList.innerHTML = "";
    
    console.log(passes);
    document.getElementById("passesVariance").innerText = `Password Variance: ${getPasswordVariation32(passes)}`;

    let outputText = "";
    for (let i = 0; i < passes.length; i++) {
        outputText += passes[i].toString(16).padStart(8, '0') + " ";
    }

    const elem = document.createElement("p");
    elem.style.fontFamily = "monospace";
    elem.textContent = outputText;     
    passwordsDisplayList.appendChild(elem);
}
pHashSizeInput.addEventListener("input", function() {
  if (pHashSizeInput.value == undefined || pHashSizeInput.value == "") {
    return;
  }
  if (pHashSizeInput.value < 1) {
    return;
  }
  console.log(pHashSizeInput.value)
  pHashSize = pHashSizeInput.value
})
