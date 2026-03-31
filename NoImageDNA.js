export function getPixels(canvas) {
    const ctx = canvas.getContext('2d');
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

const BASIC_SET_PASSWORDS = genPasses(64);
const XOR_BEST_MID = 0x7A3C19E2
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181, 191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281];

export const FLAGS = {
    "PASSWORD": 1 << 0,
    "SWAPBIGROW": 1 << 1,
    "SWAPBIGCOL": 1 << 2,
    "INTERACTIONS1": 1 << 3
};

export const FLAGS_ALL = Object.values(FLAGS).reduce((acc, flag) => acc | flag, 0);
console.log(FLAGS_ALL);

export function transform(pixels, width, height, decrypt = false, passwords = BASIC_SET_PASSWORDS, flags = FLAGS_ALL) {
    if (passwords == BASIC_SET_PASSWORDS) {
        console.warn("Using default passwords, this may be insecure.")
    }
    const out = new Uint32Array(pixels.buffer);
    const p = passwords.map(password => [
        (password >>> 0) & 0xff,
        (password >>> 8) & 0xff,
        (password >>> 16) & 0xff,
        (password >>> 24) & 0xff
    ]);

    const masterKey = passwords.reduce((acc, p) => acc ^ p, 0) >>> 0;

    console.log(width, width / 2, height, height / 2);

    const operations = [{
        flag: FLAGS.PASSWORD,
        do: () => applyPassword(out, masterKey),
        reverse: () => applyPassword(out, masterKey)
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
    }];

    const activeOps = decrypt ? operations : [...operations].reverse();

    activeOps.forEach(op => {
        if ((flags & op.flag) !== 0) {
            decrypt ? op.do() : op.reverse();
        }
    });

    return new Uint8ClampedArray(out.buffer);
}


function swapHalves(data, width, height) {
    const halfWidth = Math.floor(width / 2);
    const rightStart = width % 2 === 0 ? halfWidth : halfWidth + 1;

    const tempBuffer = new Uint32Array(halfWidth);

    for (let r = 0; r < height; r++) {
        const rowOffset = r * width;
        const leftIdx = rowOffset;
        const rightIdx = rowOffset + rightStart;

        tempBuffer.set(data.subarray(leftIdx, leftIdx + halfWidth));
        data.copyWithin(leftIdx, rightIdx, rightIdx + halfWidth);
        data.set(tempBuffer, rightIdx);
    }
}

function recursiveSwapCols(data, width, height, stride = 13) {
    function processSegment(colStart, colWidth) {
        if (colWidth <= stride) return;

        const halfWidth = Math.floor(colWidth / 2);
        const rightOffset = colWidth % 2 === 0 ? halfWidth : halfWidth + 1;

        for (let r = 0; r < height; r++) {
            const rowOffset = r * width;
            for (let c = 0; c < halfWidth; c++) {
                const idxA = rowOffset + colStart + c;
                const idxB = rowOffset + colStart + rightOffset + c;

                const temp = data[idxA];
                data[idxA] = data[idxB];
                data[idxB] = temp;
            }
        }

        processSegment(colStart, halfWidth); // Left half
        processSegment(colStart + rightOffset, halfWidth); // Right half
    }

    processSegment(0, width);
}

function recursiveSwapRows(data, width, height, stride = 13) {
    function processSegment(rowStart, rowHeight) {
        // Base case: if the current segment height is small enough, stop
        if (rowHeight <= stride) return;

        const halfHeight = Math.floor(rowHeight / 2);
        // Calculate the start of the bottom half to handle odd heights correctly
        const bottomOffset = rowHeight % 2 === 0 ? halfHeight : halfHeight + 1;

        // Iterate through each column
        for (let c = 0; c < width; c++) {
            // For each column, swap pixels between the top half and bottom half segments
            for (let r = 0; r < halfHeight; r++) {
                const idxA = (rowStart + r) * width + c;
                const idxB = (rowStart + bottomOffset + r) * width + c;

                const temp = data[idxA];
                data[idxA] = data[idxB];
                data[idxB] = temp;
            }
        }

        // Recursively process the top and bottom halves
        processSegment(rowStart, halfHeight);
        processSegment(rowStart + bottomOffset, halfHeight);
    }

    processSegment(0, height);
}

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

function applyPassword(data, mkey) {
    for (let i = 0; i < data.length; i++) {
        data[i] ^= mkey;
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

function swap32(val) {
    return ((val & 0xFF) << 24 |
        (val & 0xFF00) << 8 |
        (val & 0xFF0000) >> 8 |
        (val >> 24) & 0xFF) >>> 0;
}

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
export async function getVisualFingerprint(canvas, size = 8) {
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
