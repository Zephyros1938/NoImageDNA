import {
    substitution8Bit,
    inverseSubstitution8Bit 
} from './Tables.js';
export function getPixels(canvas) {
    const ctx = canvas.getContext('2d');
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

function reverseSubarray(array,start,end) {
    while (start < end) {
        [array[start],array[end]] = [array[end],array[start]];
        start++; end--;
    }
}

function takeNBitsAtM(integer, intsize, n, m) {
    integer = integer >>> (intsize - (m+n));
    return integer & ((1 << n) - 1);
}

const BASIC_SET_PASSWORDS = genPasses(1024);
const XOR_BEST_MID = 0x7A3C19E2
const PRIMES = [2];
let i = 2;
while (PRIMES.length < 20) { // Get primes
    let divisible = false;
    for (let j = 2; j <= Math.ceil(Math.sqrt(i)); j++) {
        if (i/j == Math.floor(i/j)) {
            divisible = true;
            break;
        }
    } 
    if (!divisible) {
        PRIMES.push(i);
    }
    i++;
}

const P1 = Array.from({ length: 64 }, (_, i) => (i * (i + 1)) / 2);

const DIVY = Array.from({ length: 256 }, (_, i) => {
    let res = 0n; // Using BigInt for safety during bitwise construction
    for (let bit = 0; bit < 8; bit++) {
        if ((i >> bit) & 1) {
            res |= (0xFn << BigInt(bit * 4));
        }
    }
    return Number(res) >>> 0;
});
export const FLAGS = {
    "PASSWORD": 1 << 0,
    "SWAPBIGROW": 1 << 1,
    "SWAPBIGCOL": 1 << 2,
    "INTERACTIONS1": 1 << 3,
    "SWAPBIGROW_P1": 1 << 4,
    "SWAPBIGCOL_P1": 1 << 5,
    "NOTGATE": 1 << 6,
    "COLORPOSITION": 1 << 7,
    "FLIPPER": 1 << 8,
    "FLIPPER_LEGACY": 1 << 9,
    "BARCODE": 1 << 10,
    "INTERACTIONS2": 1 << 11,
    "SHIFTCOLOR": 1 << 12,
    "REVERSER": 1 << 13
};

export const STANDARDS = {
    "NONE": 0,
    "BLOCKTHING": 1,
};
export const FLAGS_ALL = Object.values(FLAGS).reduce((acc, flag) => acc | flag, 0);
console.log(FLAGS_ALL);

export function transform(pixels, width, height, decrypt = false, passwords = BASIC_SET_PASSWORDS, flags = FLAGS_ALL, recursive, standardChoice) {
    console.log(passwords)
    if (passwords == BASIC_SET_PASSWORDS) {
        console.warn("Using default passwords, this may be insecure.")
    }

    if (flags == 0) {
        flags = FLAGS_ALL // All flags because disabling all flags disables all flags instead of enabling all
    }

    const out = new Uint32Array(pixels.buffer);
    const masterKey = passwords.reduce((acc, p) => acc ^ p, 0) >>> 0;

    const operationsFlags = [{
        flag: FLAGS.PASSWORD,
        do: () => applyPassword(out, masterKey, passwords),
        reverse: () => deplyPassword(out, masterKey, passwords)
    }, {
        flag: FLAGS.SWAPBIGCOL,
        do: () => recursiveSwapBigCols(out, width, height, PRIMES.reverse()),
        reverse: () => recursiveSwapBigCols(out, width, height, PRIMES)
    }, {
        flag: FLAGS.SWAPBIGROW,
        do: () => recursiveSwapBigRows(out, width, height, PRIMES.reverse()),
        reverse: () => recursiveSwapBigRows(out, width, height, PRIMES)
    }, {
        flag: FLAGS.INTERACTIONS1,
        do: () => applyInteractions(out),
        reverse: () => reverseInteractions(out)
    }, {
        flag: FLAGS.SWAPBIGCOL_P1,
        do: () => recursiveSwapBigCols(out, width, height, P1.reverse()),
        reverse: () => recursiveSwapBigCols(out, width, height, P1)
    }, {
        flag: FLAGS.SWAPBIGROW_P1,
        do: () => recursiveSwapBigRows(out, width, height, P1.reverse()),
        reverse: () => recursiveSwapBigRows(out, width, height, P1)
    }, {
        flag: FLAGS.NOTGATE,
        do: () => notGate(out, passwords),
        reverse: () => notGate(out, passwords)
    }, {
        flag: FLAGS.COLORPOSITION,
        do: () => colorByPos(out, masterKey),
        reverse: () => colorByPos(out, masterKey)
    }, {
        flag: FLAGS.FLIPPER,
        do: () => pixelFlipper(out, recursive ? passwords : [masterKey], 7),
        reverse: () => pixelUnflipper(out, recursive ? passwords : [masterKey], 7)
    },{
        flag: FLAGS.FLIPPER_LEGACY,
        do: () => pixelFlipperLegacy(out, masterKey, 7),
        reverse: () => pixelUnflipperLegacy(out, masterKey, 7)
    }, {
        flag: FLAGS.BARCODE,
        do: () => applyBarcode(out, width, height, masterKey, passwords),
        reverse: () => applyBarcode(out, width, height, masterKey, passwords)
    }, {
        flag: FLAGS.INTERACTIONS2,
        do: () => rotateClockwiseInteraction(out),
        reverse: () => rotateCounterclockwiseInteraction(out)
    }, {
        flag: FLAGS.SHIFTCOLOR,
        do: () => colorShifter(out),
        reverse: () => colorUnshifter(out)
    }, {
        flag: FLAGS.REVERSER,
        do: () => pixelReverser(out, passwords, 5),
        reverse: () => pixelVerser(out, passwords, 5)
    }];

    const operationsStandard = {
        [STANDARDS.AESPASS]: {
            do: () => doBlock(out, passwords),
            reverse: () => undoBlock(out, passwords)
        }
    }
    if (standardChoice == 0) {
        const activeOps = decrypt ? [...operationsFlags].reverse() : operationsFlags;
        activeOps.forEach(op => {
            if ((flags & op.flag) !== 0) {
                decrypt ? op.reverse() : op.do();
            }
        });
    } else {
        decrypt ? operationsStandard[standardChoice].reverse() : operationsStandard[standardChoice].do();
    }

    return new Uint8ClampedArray(out.buffer);
}

function recursiveSwapCols(data, width, height, stride = 13) {
    let colWidth = width;
    
    // Instead of recursion, we can simulate the "halving" logic
    // Or, if you specifically need the recursive behavior:
    function process(colStart, currentWidth) {
        if (currentWidth <= stride) return;

        const half = Math.floor(currentWidth / 2);
        const rightOffset = currentWidth % 2 === 0 ? half : half + 1;

        // OPTIMIZATION: Row loop outside, Column loop inside
        for (let r = 0; r < height; r++) {
            const rowOffset = r * width + colStart;
            for (let c = 0; c < half; c++) {
                const idxA = rowOffset + c;
                const idxB = rowOffset + rightOffset + c;
                
                const temp = data[idxA];
                data[idxA] = data[idxB];
                data[idxB] = temp;
            }
        }

        process(colStart, half);
        process(colStart + rightOffset, half);
    }
    process(0, width);
}

function recursiveSwapRows(data, width, height, stride = 13) {
    function process(rowStart, currentHeight) {
        if (currentHeight <= stride) return;

        const half = Math.floor(currentHeight / 2);
        const bottomOffset = currentHeight % 2 === 0 ? half : half + 1;

        // OPTIMIZATION: Swap whole rows at once using typed array methods
        for (let r = 0; r < half; r++) {
            const startA = (rowStart + r) * width;
            const startB = (rowStart + bottomOffset + r) * width;
            
            // Grab a temporary copy of one row segment
            const temp = data.slice(startA, startA + width);
            // Move row B to row A
            data.set(data.subarray(startB, startB + width), startA);
            // Move temp (old row A) to row B
            data.set(temp, startB);
        }

        process(rowStart, half);
        process(rowStart + bottomOffset, half);
    }
    process(0, height);}

function recursiveSwapBigCols(data, width, height, strides) {
    strides.forEach((stride) => {
        recursiveSwapCols(data, width, height, stride);
    });
}

function recursiveSwapBigRows(data, width, height, strides) {
    strides.forEach((stride) => {
        recursiveSwapRows(data, width, height, stride);
    });
}

export function removeAlpha(pixels) {
    const data = new Uint8ClampedArray(pixels);
    for (let i = 0; i < data.length; i += 4) {
        data[i + 3] = 255;
    }
    return data;
}

function applyPassword(data, mkey, keys = []) {
  for (let i = 0; i < data.length; i++) {
    data[i] ^= mkey;
    data[i] ^= keys[i % keys.length] | i;
    data[i] ^= keys[keys[i % keys.length] % keys.length];
  }
}

function deplyPassword(data, mkey, keys = []) {
  for (let i = 0; i < data.length; i++) {
    data[i] ^= mkey;
    data[i] ^= keys[i % keys.length] | i;
    data[i] ^= keys[keys[i % keys.length] % keys.length];

  }
}

function notGate(data, passwords) {
    let mkey = passwords[(passwords.reduce((acc, p) => acc ^ p, 0) >>> 0) % passwords.length]
    for (let i = 0; i < data.length; i++) {
        let mkey = passwords[Math.floor(i/32)%passwords.length] // Change key
        data[i] = (((mkey >>> (32 - (i%32))) & 1) == 1) ? ~data[i] : data[i]; // NOT item if position mod bit is 1
    }
}

function pixelFlipper(data, passwords, b) {
    let digits = 1 << b 
    let bitNo = 32
    const tempBuffer = new data.constructor(digits);
    for (let mkey of passwords) {
        const segments = new Uint32Array(bitNo/b);
        for (let i = 1; i <= bitNo / b; i++) {
            segments[i-1] = (mkey >>> (bitNo-(i*b))) & (digits - 1); // Split key into b-bit long sections
        }
        for (let i = 0; i <= data.length-digits; i++) {
            let kbit = segments[i%segments.length]
            if (kbit != 0 && kbit != digits) {
                tempBuffer.set(data.subarray(i,i+kbit), digits-kbit)
                tempBuffer.set(data.subarray(i+kbit, i+digits),0)
                data.set(tempBuffer,i)
            }
        }  
    }
}

function pixelUnflipper(data, passwords, b) {
    let digits = 1 << b
    let bitNo = 32
    const tempBuffer = new data.constructor(digits);
    for (let j = passwords.length-1; j >= 0; j--) {
        let mkey = passwords[j]
        const segments = new Uint32Array(bitNo/b);
        for (let i = 1; i <= bitNo / b; i++) {
            segments[i-1] = (mkey >>> (bitNo-(i*b))) & (digits - 1) // Split key into b-bit long sections
        }
        for (let i = data.length-digits; i >= 0; i--) {
            let kbit = segments[i%segments.length]
            if (kbit != 0 && kbit != digits) {
                tempBuffer.set(data.subarray(i,i+(digits-kbit)), kbit)
                tempBuffer.set(data.subarray(i+(digits-kbit),i+digits),0)
                data.set(tempBuffer,i)
            }
        }  
    }
}

function pixelFlipperLegacy(data, mkey, b) {
    let digits = 1 << b
    const bitNo = 32;
    const segments = [];
    for (let i = 1; i <= bitNo / b; i++) {
        segments.push((mkey >>> (bitNo-(i*b))) & (digits - 1)) 
    }
    for (let i = 0; i <= data.length-digits; i++) {
        let kbit = segments[i%segments.length]
        let pA = data.slice(i, i+kbit)
        let pB = data.slice(i+kbit, i+digits)
        data.set(pB,i)
        data.set(pA,i+pB.length)
    }  
}
function pixelUnflipperLegacy(data, mkey, b) {
    let digits = 1 << b
    const bitNo = 32
    const segments = [];
    for (let i = 1; i <= bitNo / b; i++) {
        segments.push((mkey >>> (bitNo-(i*b))) & (digits - 1)) 
    }
    for (let i = data.length-digits; i >= 0; i--) {
        let kbit = segments[i%segments.length]
        let pA = data.slice(i, i+(digits-kbit))
        let pB = data.slice(i+(digits-kbit), i+digits)
        data.set(pB,i)
        data.set(pA,i+pB.length)
    }
}

function pixelReverser(data, passwords, s) {
    for (let i = 0; i < data.length-s; i++) {
        let mkey = passwords[Math.floor(i/32)%passwords.length];
        let kbit = ((mkey >>> (32 - (i%32))) & 1);
        if (kbit == 1) {
            reverseSubarray(data, i, i+s);
        }
    }
}
function pixelVerser(data, passwords, s) {
    for (let i = data.length-(s+1); i >= 0; i--) {
        let mkey = passwords[Math.floor(i/32) % passwords.length];
        let kbit = ((mkey >>> (32 - (i%32))) & 1);
        if (kbit == 1) {
            reverseSubarray(data, i, i+s);
        }
    }
}

function colorByPos(data, mkey) {
  for (let i = 0; i < data.length; i++) {
    let kbit = (mkey >>> (30 - (i % 16))) & 0b11;
    let pixel = data[i];
    let rgba = [pixel&0xFF, (pixel>>>8)&0xFF, (pixel>>>16)&0xFF, (pixel>>>24)&0xFF];

    rgba[kbit] = (rgba[kbit] ^ i) & 0xFF; // Change pixel color by xoring it with position and keeping a byte

    data[i] = (rgba[0] | (rgba[1] << 8) | (rgba[2] << 16) | (rgba[3] << 24))
  }  
}

function applyInteractions(data32) {
    for (let i = 0; i < data32.length; i++) {
        let pixel = data32[i];
        let r = pixel & 0xFF;
        let g = (pixel >> 8) & 0xFF;
        let b = (pixel >> 16) & 0xFF;
        let a = (pixel >> 24) & 0xFF;

        r ^= g;
        g ^= b;
        b ^= a;

        data32[i] = (r | (g << 8) | (b << 16) | (a << 24));
    }
}
function rotateClockwiseInteraction(data) {
    for (let i = 0; i < data.length; i++) {
        let pixel = data[i];
        let r = pixel & 0xFF;
        let g = (pixel >> 8) & 0xFF;
        let b = (pixel >> 16) & 0xFF;
        let a = (pixel >> 24) & 0xFF;

        [r,g,b] = [b,r,g] // rotates r g and b

        data[i] = (r | (g << 8) | (b << 16) | (a << 24));
    }
}
function rotateCounterclockwiseInteraction(data) {
    for (let i = 0; i < data.length; i++) {
        let pixel = data[i];
        let r = pixel & 0xFF;
        let g = (pixel >> 8) & 0xFF;
        let b = (pixel >> 16) & 0xFF;
        let a = (pixel >> 24) & 0xFF;

        [r,g,b] = [g,b,r] // rotates r g and b

        data[i] = (r | (g << 8) | (b << 16) | (a << 24));
    }
}

function colorShifter(data) {
    let t = (data[data.length-1] >> 24) & 0xFF
    for (let i = 0; i < data.length; i++) {
        let pixel = data[i];
        let r = pixel & 0xFF;
        let g = (pixel >> 8) & 0xFF;
        let b = (pixel >> 16) & 0xFF;
        let a = (pixel >> 24) & 0xFF;
        let oA = a;
        data[i] = (t | (r << 8) | (g << 16) | (b << 24));
        t = oA;
    }
}
function colorUnshifter(data) {
    let t = data[0] & 0xFF
    for (let i = data.length-1; i >= 0; i--) {
        let pixel = data[i];
        let r = pixel & 0xFF;
        let g = (pixel >> 8) & 0xFF;
        let b = (pixel >> 16) & 0xFF;
        let a = (pixel >> 24) & 0xFF;
        let oA = r;
        data[i] = (g | (b << 8) | (a << 16) | (t << 24));
        t = oA;
    }
}

function doBlock(data, passwords) {
    console.log("Do Block");
}

function doBlock(data, passwords) {
    console.log("Undo Block");
}
function swapEndianness32(n) {
  return ((n & 0xFF) << 24) | 
    ((n & 0xFF00) << 8) | 
    ((n >> 8) & 0xFF00) | 
    ((n >> 24) & 0xFF);
}

function swapColumnBlocks(data, width, height, startA, startB, blockWidth) {
    for (let r = 0; r < height; r++) {
        const rowOffset = r * width;
        for (let c = 0; c < blockWidth; c++) {
            const idxA = rowOffset + startA + c;
            const idxB = rowOffset + startB + c;
            const temp = data[idxA];
            data[idxA] = data[idxB];
            data[idxB] = temp;
        }
    }
}

function reverseInteractions(data32) {
    for (let i = 0; i < data32.length; i++) {
        let pixel = data32[i];
        let r = pixel & 0xFF;
        let g = (pixel >> 8) & 0xFF;
        let b = (pixel >> 16) & 0xFF;
        let a = (pixel >> 24) & 0xFF;

        b ^= a;
        g ^= b;
        r ^= g;



        data32[i] = (r | (g << 8) | (b << 16) | (a << 24));
    }
}

export function swap32(val) {
    return ((val & 0xFF) << 24 |
        (val & 0xFF00) << 8 |
        (val & 0xFF0000) >> 8 |
        (val >> 24) & 0xFF) >>> 0;
}

export function swap32a(arr) {
  return arr.map(swap32);
}


function applyBarcode(data, width, height, mkey, passes) {
  var passT = passes[0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width) + x;
      const p = passes[i % passes.length];
      let pixel = data[i];
      let r = pixel & 0xFF;
      let g = (pixel >> 8) & 0xFF;
      let b = (pixel >> 16) & 0xFF;
      let a = (pixel >> 24) & 0xFF;

      switch (i % 3) {
        case 0:
          r ^= passT & 0xff; break;
        case 1:
          g ^= passT & 0xff; break;
        case 2:
          b ^= passT & 0xff; break;
      }
      if (x % (mkey & y & (passT & 0xff)) < y % (mkey & x & (passT & 0xff))) {
        passT = passT & p;
      } else {
        passT = passT | (~p ^ mkey);
      }
      if (x == y) {
        passT = passes[0];
      }

      data[i] = (r | (g << 8) | (b << 16) | (a << 24));
    }
  }
};

const ArrayUtils = {
  getColumn: (data, width, height, columnIdx)=> {
    if (columnIdx >= width){
      throw `columnIdx must not be larger than width! (columnIdx was ${columnIdx}, width was ${width})`;}
    return Array.from({length: height}, (_, i) => data[i * width + columnIdx]);
  },
  getRow: (data, width, height, rowIdx) => {
    if (rowIdx >= height) {
      throw `rowIdx must not be larger than height! (rowIdx was ${rowIdx}, height was ${height}`;}
    return data.slice(rowIdx * width, rowIdx * width + width);
  }
};

/*
 * Password Utils
 */

export function genPasses(count = 32) {
    const array = new Uint32Array(count);
    self.crypto.getRandomValues(array);
    return Array.from(array);
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

export async function getVisualFingerprint(canvas, size = 8, displayContainerId = undefined) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = size + 1; // Extra pixel for horizontal difference
    tempCanvas.height = size;
    const ctx = tempCanvas.getContext('2d');

    // 1. Grayscale and Resize (Standard Perceptual Pre-processing)
    ctx.filter = 'grayscale(100%)';
    ctx.drawImage(canvas, 0, 0, size + 1, size);

    

    const displayContainer = document.getElementById(displayContainerId);
    if (displayContainer) {
    displayContainer.innerHTML = ''; 
    
    const scaleFactor = 20;
    tempCanvas.style.width = `${(tempCanvas.width) * scaleFactor}px`; 
    tempCanvas.style.height = `${tempCanvas.height * scaleFactor}px`;
    
    tempCanvas.style.imageRendering = 'pixelated'; 
    
    displayContainer.appendChild(tempCanvas);
}

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

/*
 * Storage Utils
 */

const StorageUtils = {
  Cookie: {
    setCookie: (name, value, days) => {
      let expires = "";
      if (days) {
        let date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = ";expires=" + date.toUTCString();
      }
      document.cookie = name + (value || "") + expires + "; path=/; SameSite=Lax";
    },
    getCookie: (name) => {
      let nameEQ = name + "=";
      let ca = document.cookie.split(';');
      for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
      }
      return null; // Return null if not found
    },
    eraseCookie(name) {
      document.cookie = name + '=; Max-Age=-99999999; path=/;';
    }
  },
  LocalStorage: {
    setItem: (name, val) => {localStorage.setItem(name, val);},
    getItem: (name) => {return localStorage.getItem(name);},
    exists: (name) => {return localStorage.getItem(name) !== null;},
    removeItem: (name) => {localStorage.removeItem(name);},
    clear() {localStorage.clear();},
    setJSON: (name, dict) => {localStorage.setItem(name, JSON.stringify(dict));},
    getJSON: (name) => {return JSON.parse(localStorage.getItem(name));}
  }
}
