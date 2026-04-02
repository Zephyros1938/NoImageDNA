import {
    getPixels,
    transform,
    genPasses,
    removeAlpha,
    getPasswordVariation32,
    getVisualFingerprint,
    getHammingDistance,
    FLAGS, FLAGS_ALL
} from './NoImageDNA.js';

const imagePreInput = document.getElementById("imagePre");
const statusDiv = document.getElementById("compareStatus");
const passwordsRefreshButton = document.getElementById("refreshPasses");
const passwordsDisplayList = document.getElementById("passes");
const pHashSizeInput = document.getElementById("pHashSize");
const settingsContainer = document.getElementById('settingsContainer');
const recursiveContainer = document.getElementById('Recursive');

const MESSAGES = {
    "encrypting": "Encrypting...",
    "decrypting": "Decrypting...",
    "success": "SHA-256 Hashes match, no data has been lost",
    "fail": "SHA-256 Hashes do not match, data may be degraded/corrupted",
    "closenessWarn": "SHA-256 Hashes match, but distance of pHashes under 30"
}

var passes = [];
var pHashSize = 8; // This is standard for perceptual hashing
var settings = FLAGS_ALL;

Object.entries(FLAGS).forEach(([name, value]) => {
  const label = document.createElement('label');
  label.style.display = 'block';
  //console.log(name, value);
  
  label.innerHTML = `
    <input type="checkbox" value="${value}" data-name="${name}">
    ${name} (Bit: ${value})
  `;
  
  settingsContainer.appendChild(label);
});

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

    // Make sure they dont stack 2**64 passwords
    if ((passes.length > 50 || passes.length == 0) && recursiveContainer.checked) {
        let status = confirm(`Are you sure you want to stack ${passes.length > 0 ? passes.length : 1024} passwords?`)
        if (!status) {
            return;
        }
    }
    const statusDiv = document.getElementById("compareStatus");
    statusDiv.style.display = "block";
    // 2. Extract pixels
    statusDiv.textContent = MESSAGES.encrypting;
    statusDiv.className = "status crypt";
    const originalPixels = getPixels(canvasOrig);
    const hash1 = await sha256(originalPixels);
    const pHash1 = await getVisualFingerprint(canvasOrig, pHashSize, "preDisplayPHash");
    document.getElementById('hashOrig').textContent = `Hash: ${hash1}`;
    document.getElementById('pHashOrig').textContent = `pHash: ${parseInt(pHash1, 2).toString(16)}`;

    const encryptedPixels = transform(originalPixels, canvasOrig.width, canvasOrig.height, false, passes.length !== 0 ? passes : undefined,settings, recursiveContainer.checked);

    canvasEnc.width = canvasOrig.width;
    canvasEnc.height = canvasOrig.height;
    ctxEnc.putImageData(new ImageData(encryptedPixels, canvasEnc.width, canvasEnc.height), 0, 0);

    canvasEncFullAlpha.width = canvasOrig.width;
    canvasEncFullAlpha.height = canvasOrig.height;
    ctxEncFullAlpha.putImageData(new ImageData(removeAlpha(encryptedPixels), canvasEncFullAlpha.width, canvasEncFullAlpha.height), 0, 0);

    statusDiv.textContent = MESSAGES.decrypting;
    statusDiv.className = "status crypt";
    const hash2 = await sha256(encryptedPixels);
    const pHash2 = await getVisualFingerprint(canvasEnc, pHashSize, "encDisplayPHash");
    document.getElementById('hashEnc').textContent = `Hash: ${hash2}`;
    document.getElementById('pHashEnc').textContent = `pHash: ${parseInt(pHash2, 2).toString(16)}`;

    //  Decrypt 
    const decryptedPixels = transform(encryptedPixels, canvasOrig.width, canvasOrig.height, true, passes.length !== 0 ? passes : undefined, settings, recursiveContainer.checked);

    canvasDec.width = canvasOrig.width;
    canvasDec.height = canvasOrig.height;
    ctxDec.putImageData(new ImageData(decryptedPixels, canvasDec.width, canvasDec.height), 0, 0);

    const hash3 = await sha256(decryptedPixels);
    document.getElementById('hashDec').textContent = `Hash: ${hash3}`;

    let hammingDistance = getHammingDistance(pHash1, pHash2);
    document.getElementById("pHashHammingDistance").innerText = hammingDistance / (pHashSize * pHashSize);
    if (hash1 === hash3) {
        if (hammingDistance < 30) {
            statusDiv.textContent = MESSAGES.closenessWarn;
            statusDiv.className = "status closenessWarn";
        } else {
            statusDiv.textContent = MESSAGES.success;
            statusDiv.className = "status match";
        }
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


    //console.log(passes);
    document.getElementById("passesVariance").innerText = `Password Variance: ${getPasswordVariation32(passes)}`;

    let outputText = "";
    for (let i = 0; i < passes.length; i++) {
        outputText += passes[i].toString(16).padStart(8, '0') + " ";
    }

    passwordsDisplayList.value = outputText;
    const passesWrapper = document.getElementById('passesWrapper');
    passwordsDisplayList.value = outputText;
    passesWrapper.dataset.replicatedValue = outputText;
}
downloadImage.onclick = function() {
    const canvasEnc = document.getElementById('canvasEnc');
    canvasEnc.toBlob(function(blob) {
        const fb = new Blob([blob], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(fb);
        const link = document.createElement("a");
        link.download = 'encrypted.nid';
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 'image/png');
}
pHashSizeInput.addEventListener("input", function() {
    if (pHashSizeInput.value == undefined || pHashSizeInput.value == "") {
        return;
    }
    if (pHashSizeInput.value < 1) {
        return;
    }
    //console.log(pHashSizeInput.value)
    pHashSize = pHashSizeInput.value
})
settingsContainer.addEventListener('change', () => {
  let mask = 0;
  const activeNames = [];

  // Get all checked boxes
  const checked = settingsContainer.querySelectorAll('input:checked');
  
  checked.forEach(input => {
    const val = parseInt(input.value);
    mask |= val; // Apply bitwise OR
  });

  // Verification: Use the dictionary to "decode" the mask
  Object.entries(FLAGS).forEach(([name, value]) => {
    if ((mask & value) === value) {
      activeNames.push(name);
    }
  });

  settings = mask;

  document.getElementById('settingsEnabled').textContent = mask;
  //document.getElementById('active-flags').textContent = activeNames.join(', ') || 'None';
});
