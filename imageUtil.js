export function getPixels(canvas) {
    const ctx = canvas.getContext('2d');
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

export function encrypt(pixels, width, height, password = 0xf0f0f0f0) {
  const out = new Uint8ClampedArray(pixels);

  for (let i = 0; i < pixels.length; i+=4)
  {
    out[i] ^= ((password << 0) & 0xff);
    out[i+1] ^= ((password << 8) & 0xff);
    out[i+2] ^= ((password << 16) & 0xff);
    out[i+3] ^= ((password << 24) & 0xff);
    
  }

  console.log(pixels.length);

  return out;
}
