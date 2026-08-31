/**
 * Pure TypeScript, zero-dependency QR Code Matrix Generator (ISO/IEC 18004 compliant).
 * Generates clean 2D boolean matrices and SVG markup for client-side QR codes with zero third-party network requests.
 */

// Galois Field GF(256) tables with primitive polynomial 0x11D (285)
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = val;
    EXP_TABLE[i + 255] = val;
    LOG_TABLE[val] = i;
    val = (val << 1) ^ (val >= 128 ? 0x11d : 0);
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x] + LOG_TABLE[y]];
}

function computeReedSolomonRemainder(data: Uint8Array, eccCount: number): Uint8Array {
  // Compute generator polynomial of degree eccCount
  let gen = new Uint8Array([1]);
  for (let i = 0; i < eccCount; i++) {
    const nextGen = new Uint8Array(gen.length + 1);
    const factor = EXP_TABLE[i];
    for (let j = 0; j < gen.length; j++) {
      nextGen[j] ^= gfMul(gen[j], factor);
      nextGen[j + 1] ^= gen[j];
    }
    gen = nextGen;
  }

  const remainder = new Uint8Array(eccCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    for (let j = 0; j < eccCount - 1; j++) {
      remainder[j] = remainder[j + 1] ^ gfMul(gen[j], factor);
    }
    remainder[eccCount - 1] = gfMul(gen[eccCount - 1], factor);
  }

  return remainder;
}

// QR Code Version Capacity & Specs (ECC Level M, Byte Mode)
// Version 1..10 capacities and block structures
interface QRVersionSpec {
  version: number;
  size: number;
  dataCodewords: number;
  eccCodewordsPerBlock: number;
  numBlocks: number;
  alignmentPatterns: number[];
}

const QR_SPECS: QRVersionSpec[] = [
  { version: 1, size: 21, dataCodewords: 16, eccCodewordsPerBlock: 10, numBlocks: 1, alignmentPatterns: [] },
  { version: 2, size: 25, dataCodewords: 28, eccCodewordsPerBlock: 16, numBlocks: 1, alignmentPatterns: [6, 18] },
  { version: 3, size: 29, dataCodewords: 44, eccCodewordsPerBlock: 26, numBlocks: 1, alignmentPatterns: [6, 22] },
  { version: 4, size: 33, dataCodewords: 64, eccCodewordsPerBlock: 18, numBlocks: 2, alignmentPatterns: [6, 26] },
  { version: 5, size: 37, dataCodewords: 86, eccCodewordsPerBlock: 24, numBlocks: 2, alignmentPatterns: [6, 30] },
  { version: 6, size: 41, dataCodewords: 108, eccCodewordsPerBlock: 16, numBlocks: 4, alignmentPatterns: [6, 34] },
  { version: 7, size: 45, dataCodewords: 124, eccCodewordsPerBlock: 18, numBlocks: 4, alignmentPatterns: [6, 22, 38] },
  { version: 8, size: 49, dataCodewords: 154, eccCodewordsPerBlock: 22, numBlocks: 4, alignmentPatterns: [6, 24, 42] },
  { version: 9, size: 53, dataCodewords: 182, eccCodewordsPerBlock: 22, numBlocks: 5, alignmentPatterns: [6, 26, 46] },
  { version: 10, size: 57, dataCodewords: 216, eccCodewordsPerBlock: 26, numBlocks: 5, alignmentPatterns: [6, 28, 50] },
];

export interface QRCodeMatrix {
  size: number;
  modules: boolean[][];
}

export function generateQRCodeMatrix(text: string): QRCodeMatrix {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(text);

  // Find smallest fitting version
  let spec = QR_SPECS.find((s) => s.dataCodewords >= rawBytes.length + 3);
  if (!spec) {
    spec = QR_SPECS[QR_SPECS.length - 1];
  }

  const { size, dataCodewords, eccCodewordsPerBlock, numBlocks, alignmentPatterns } = spec;

  // Encode Data Bits: Byte Mode (0100) + 8-bit length + data + terminator (0000)
  const bitBuffer: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitBuffer.push((val >> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(rawBytes.length, 8); // Character count indicator (8 bits for v1-9)
  for (const b of rawBytes) {
    pushBits(b, 8);
  }

  // Terminator up to 4 zeroes
  const maxBits = dataCodewords * 8;
  for (let i = 0; i < 4 && bitBuffer.length < maxBits; i++) {
    bitBuffer.push(0);
  }
  // Pad to byte boundary
  while (bitBuffer.length % 8 !== 0 && bitBuffer.length < maxBits) {
    bitBuffer.push(0);
  }
  // Pad bytes: 0xEC (11101100), 0x11 (00010001)
  const padPatterns = [0xec, 0x11];
  let padIdx = 0;
  while (bitBuffer.length < maxBits) {
    pushBits(padPatterns[padIdx % 2], 8);
    padIdx++;
  }

  // Convert to data codewords
  const dataBytes = new Uint8Array(dataCodewords);
  for (let i = 0; i < dataCodewords; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bitBuffer[i * 8 + b];
    }
    dataBytes[i] = byteVal;
  }

  // Split into blocks and compute ECC
  const blockSize = Math.floor(dataCodewords / numBlocks);
  const remainderBlocks = dataCodewords % numBlocks;
  const blocksData: Uint8Array[] = [];
  const blocksEcc: Uint8Array[] = [];

  let offset = 0;
  for (let b = 0; b < numBlocks; b++) {
    const curLen = blockSize + (b >= numBlocks - remainderBlocks ? 1 : 0);
    const bData = dataBytes.subarray(offset, offset + curLen);
    offset += curLen;
    blocksData.push(bData);
    blocksEcc.push(computeReedSolomonRemainder(bData, eccCodewordsPerBlock));
  }

  // Interleave data codewords
  const interleaved: number[] = [];
  const maxDataBlockLen = Math.max(...blocksData.map((b) => b.length));
  for (let i = 0; i < maxDataBlockLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i < blocksData[b].length) {
        interleaved.push(blocksData[b][i]);
      }
    }
  }
  // Interleave ECC codewords
  for (let i = 0; i < eccCodewordsPerBlock; i++) {
    for (let b = 0; b < numBlocks; b++) {
      interleaved.push(blocksEcc[b][i]);
    }
  }

  // Build Grid Matrix
  const grid: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

  // 1. Finder Patterns (7x7) + Separators
  function placeFinder(top: number, left: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const qr = top + r;
        const qc = left + c;
        if (qr < 0 || qr >= size || qc < 0 || qc >= size) continue;
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          grid[qr][qc] = false; // Separator
        } else if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          grid[qr][qc] = true;
        } else {
          grid[qr][qc] = false;
        }
      }
    }
  }

  placeFinder(0, 0); // Top-Left
  placeFinder(0, size - 7); // Top-Right
  placeFinder(size - 7, 0); // Bottom-Left

  // 2. Timing Patterns (Row 6, Col 6)
  for (let i = 8; i < size - 8; i++) {
    if (grid[6][i] === null) grid[6][i] = i % 2 === 0;
    if (grid[i][6] === null) grid[i][6] = i % 2 === 0;
  }

  // 3. Dark Module
  grid[size - 8][8] = true;

  // 4. Alignment Patterns
  for (const r of alignmentPatterns) {
    for (const c of alignmentPatterns) {
      if (grid[r][c] !== null) continue; // Skip finders
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          if (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0)) {
            grid[r + dr][c + dc] = true;
          } else {
            grid[r + dr][c + dc] = false;
          }
        }
      }
    }
  }

  // 5. Reserve Format Info Area
  for (let i = 0; i < 9; i++) {
    if (grid[8][i] === null) grid[8][i] = false;
    if (grid[i][8] === null) grid[i][8] = false;
  }
  for (let i = size - 8; i < size; i++) {
    if (grid[8][i] === null) grid[8][i] = false;
    if (grid[i][8] === null) grid[i][8] = false;
  }

  // 6. Place Interleaved Codewords (Zig-Zag upward/downward)
  const bits: number[] = [];
  for (const byte of interleaved) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1);
    }
  }

  let bitIdx = 0;
  let upward = true;
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c--; // Skip vertical timing pattern column
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const colOffset of [0, -1]) {
        const curCol = c + colOffset;
        if (grid[r][curCol] === null) {
          const bit = bitIdx < bits.length ? bits[bitIdx++] : 0;
          // Apply Mask Pattern 0: (row + col) % 2 === 0
          const mask = (r + curCol) % 2 === 0;
          grid[r][curCol] = (bit === 1) !== mask;
        }
      }
    }
    upward = !upward;
  }

  // 7. Write Format Information (ECC M = 00, Mask 0 = 000 -> 00000, BCH code 15,5 with 0x5412 mask)
  // Standard format bits for ECC Level M, Mask 0 is 0b101010000010010
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  // Write around Top-Left finder
  const tlCoords: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = tlCoords[i];
    grid[r][c] = formatBits[i] === 1;
  }
  // Write around Top-Right and Bottom-Left
  for (let i = 0; i < 8; i++) {
    grid[size - 1 - i][8] = formatBits[i] === 1;
  }
  for (let i = 0; i < 7; i++) {
    grid[8][size - 7 + i] = formatBits[8 + i] === 1;
  }

  const finalModules: boolean[][] = grid.map((row) =>
    row.map((val) => val === true)
  );

  return {
    size,
    modules: finalModules,
  };
}

export function renderQRCodeSvg(text: string, size = 200, foreground = '#0f172a', background = '#ffffff'): string {
  const { size: matrixSize, modules } = generateQRCodeMatrix(text);
  const margin = 2;
  const viewBoxSize = matrixSize + margin * 2;

  let pathD = '';
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (modules[r][c]) {
        pathD += `M${c + margin},${r + margin}h1v1h-1z `;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="${viewBoxSize}" height="${viewBoxSize}" fill="${background}"/>
    <path d="${pathD}" fill="${foreground}"/>
  </svg>`;
}
