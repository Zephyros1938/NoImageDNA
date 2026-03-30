export function getPixels(canvas) {
    const ctx = canvas.getContext('2d');
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

const BASIC_SET_PASSWORDS = genPasses(64);
const XOR_BEST_MID = 0x7A3C19E2

export function transform(pixels, width, height, decrypt = false, passwords = BASIC_SET_PASSWORDS) {
  if(passwords == BASIC_SET_PASSWORDS) {
    console.warn("Using default passwords, this may be insecure.")
  }
  const out = new Uint8ClampedArray(pixels);
  const p = passwords.map(password => [
    (password >>> 0) & 0xff,
    (password >>> 8) & 0xff,
    (password >>> 16) & 0xff,
    (password >>> 24) & 0xff
  ]);

  if (decrypt) {
    applyPassword(out, p.toReversed());
    applyInteractions(out);
  } else {
    reverseInteractions(out);
    applyPassword(out, p);   
  }

  return out;
}

export function removeAlpha(pixels) {
  const data = new Uint8ClampedArray(pixels);
  for (let i = 0; i < data.length; i+=4) {
    data[i+3] = 255;
  }
  return data;
}

function applyPassword(data, ps) {
  for (const p of ps) {
  for (let i = 0; i < data.length; i += 4) {
    data[i]     ^= p[0];
    data[i + 1] ^= p[1];
    data[i + 2] ^= p[2];
    data[i + 3] ^= p[3];
  }}
}

function applyInteractions(data) {
  for (let i = 0; i < data.length; i += 4) {
    data[i]     ^= data[i + 1];
    data[i + 1] ^= data[i + 2];
    data[i + 2] ^= data[i + 3];
  }
}

function reverseInteractions(data) {
  for (let i = 0; i < data.length; i += 4) {
    // Reverse the order of operations exactly
    data[i + 2] ^= data[i + 3];
    data[i + 1] ^= data[i + 2];
    data[i]     ^= data[i + 1];
  }
}

function swap32(val) {
    return ((val & 0xFF) << 24 |
            (val & 0xFF00) << 8 |
            (val & 0xFF0000) >> 8 |
            (val >> 24) & 0xFF) >>> 0;
}

export function genPasses(count = 32) {
  var passes = [];
  for (let i = 0; i < count; i++) {
    const array = new Uint32Array(1);
self.crypto.getRandomValues(array);
const secureRandom = array[0];
    passes[i] = secureRandom;
  }
  return passes;
}

export function getPasswordVariation32(p = BASIC_SET_PASSWORDS) {
  // 1. Get the aggregate XOR sum
  let s = p.reduce((acc, val) => acc ^ val, 0) >>> 0;
  
  // 2. Count the 1s in the binary representation
  let setBits = 0;
  let temp = s;
  while (temp > 0) {
    temp &= (temp - 1); // Efficiently clears the least significant bit
    setBits++;
  }
  
  // 3. Return the distance from 16 (The "Perfect Balance")
  // A return of 0 is perfect. A return of 16 is bad (all 0s or all 1s).
  return Math.abs(16 - setBits);
}

/* 
 * ImageDNA utils
 */ 
export async function getVisualFingerprint(canvas, size=8) {
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = size + 1; // Extra pixel for horizontal difference
  tempCanvas.height = size;
  const ctx = tempCanvas.getContext('2d');
  
  // 1. Grayscale and Resize (Standard Perceptual Pre-processing)
  ctx.filter = 'grayscale(100%)';
  ctx.drawImage(canvas, 0, 0, size + 1, size);
  
  const imageData = ctx.getImageData(0, 0, size + 1, size).data;
  let hash = "";

  // 2. dHash Algorithm: Compare adjacent pixels
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = imageData[((y * (size + 1)) + x) * 4];
      const right = imageData[((y * (size + 1)) + (x + 1)) * 4];
      hash += left < right ? '1' : '0';
    }
  }
  return hash;
}

export function getHammingDistance(h1, h2) {
  let distance = 0;
  for (let i = 0; i < h1.length; i++) {
    if (h1[i] !== h2[i]) distance++;
  }
  return distance;
}


