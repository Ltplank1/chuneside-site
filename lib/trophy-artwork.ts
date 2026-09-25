const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

function uint32(bytes: Uint8Array, offset: number, littleEndian = false) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, littleEndian);
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.subarray(start, end));
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

export async function isStructurallyValidTrophyArtwork(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/png") {
    if (bytes.length < 57 || !pngSignature.every((byte, index) => bytes[index] === byte)) return false;
    let offset = 8;
    let hasImageHeader = false;
    let width = 0;
    let height = 0;
    let rowBytes = 0;
    let hasPalette = false;
    const imageData: Uint8Array[] = [];
    while (offset + 12 <= bytes.length) {
      const length = uint32(bytes, offset);
      const end = offset + 12 + length;
      if (length > bytes.length - offset - 12 || end > bytes.length) return false;
      const type = ascii(bytes, offset + 4, offset + 8);
      if (crc32(bytes.subarray(offset + 4, end - 4)) !== uint32(bytes, end - 4)) return false;
      if (offset === 8) {
        if (type !== "IHDR" || length !== 13 || !uint32(bytes, offset + 8) || !uint32(bytes, offset + 12)) return false;
        width = uint32(bytes, offset + 8);
        height = uint32(bytes, offset + 12);
        const bitDepth = bytes[offset + 16];
        const colorType = bytes[offset + 17];
        const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[colorType];
        const validDepths = ({ 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] } as Record<number, number[]>)[colorType];
        if (!channels || !validDepths.includes(bitDepth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] !== 0 || width > 4096 || height > 4096) return false;
        rowBytes = Math.ceil(width * channels * bitDepth / 8);
        if ((rowBytes + 1) * height > 64 * 1024 * 1024) return false;
        hasImageHeader = true;
      }
      if (type === "PLTE") {
        if (!length || length > 768 || length % 3) return false;
        hasPalette = true;
      }
      if (type === "IDAT" && length) imageData.push(bytes.subarray(offset + 8, end - 4));
      if (type === "IEND") {
        if (length || end !== bytes.length || !hasImageHeader || !imageData.length) return false;
        if (bytes[25] === 3 && !hasPalette) return false;
        const compressed = new Uint8Array(imageData.reduce((total, chunk) => total + chunk.length, 0));
        let position = 0;
        for (const chunk of imageData) { compressed.set(chunk, position); position += chunk.length; }
        try {
          const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate"));
          const reader = stream.getReader();
          const expected = (rowBytes + 1) * height;
          const decoded = new Uint8Array(expected);
          let count = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (count + value.length > expected) { await reader.cancel(); return false; }
            decoded.set(value, count);
            count += value.length;
          }
          if (count !== expected) return false;
          for (let row = 0; row < height; row++) if (decoded[row * (rowBytes + 1)] > 4) return false;
          return true;
        } catch { return false; }
      }
      offset = end;
    }
    return false;
  }
  return false;
}
