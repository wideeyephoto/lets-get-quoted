import { describe, it, expect } from 'vitest';
import { crc32, zipStore, zipText } from '@/lib/zip';

// A hand-written archive format. Unit tests can prove the bytes are what the
// spec says; only a real unzip can prove a real unzip accepts them, which is
// what _zipcheck.mjs does against Windows' own Expand-Archive.

const bytes = (text: string) => new TextEncoder().encode(text);
const AT = new Date(2026, 7, 5, 14, 30, 20); // 5 Aug 2026, 14:30:20 local
const u16 = (a: Uint8Array, at: number) => a[at] | (a[at + 1] << 8);
const u32 = (a: Uint8Array, at: number) => (a[at] | (a[at + 1] << 8) | (a[at + 2] << 16) | (a[at + 3] << 24)) >>> 0;

describe('crc32', () => {
  it('matches the check value the standard publishes', () => {
    // 0xcbf43926 for "123456789" is THE test vector for CRC-32. If this is
    // right the polynomial and the bit order are both right.
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for nothing', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('is unsigned', () => {
    // A signed result here writes four bytes of 0xff into the header and every
    // unzip reports the archive as corrupt.
    for (const sample of ['a', 'hello world', 'name,phone\nDana,555']) {
      expect(crc32(bytes(sample)), sample).toBeGreaterThanOrEqual(0);
      expect(crc32(bytes(sample)), sample).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('zipStore', () => {
  it('starts with the local file header signature', () => {
    const zip = zipText([{ name: 'a.csv', text: 'x' }], AT);
    expect(u32(zip, 0)).toBe(0x04034b50);
  });

  it('ends with an end-of-central-directory record pointing at the directory', () => {
    const zip = zipText([{ name: 'a.csv', text: 'hello' }, { name: 'b.csv', text: 'world!' }], AT);
    const eocdAt = zip.length - 22; // no comment, so the record is fixed-length
    expect(u32(zip, eocdAt)).toBe(0x06054b50);
    expect(u16(zip, eocdAt + 8)).toBe(2);  // entries on this disk
    expect(u16(zip, eocdAt + 10)).toBe(2); // entries in total
    const directoryAt = u32(zip, eocdAt + 16);
    const directorySize = u32(zip, eocdAt + 12);
    expect(u32(zip, directoryAt)).toBe(0x02014b50);
    expect(directoryAt + directorySize).toBe(eocdAt);
  });

  it('records each entry at an offset that really is its local header', () => {
    // The offset in the central directory is how an unzip finds the data. Off
    // by one byte and the archive opens to nothing.
    const zip = zipText([{ name: 'one.csv', text: 'aaa' }, { name: 'two.csv', text: 'bbbb' }], AT);
    const eocdAt = zip.length - 22;
    let at = u32(zip, eocdAt + 16);
    for (let i = 0; i < 2; i += 1) {
      const nameLen = u16(zip, at + 28);
      const offset = u32(zip, at + 42);
      expect(u32(zip, offset), `entry ${i}`).toBe(0x04034b50);
      at += 46 + nameLen;
    }
  });

  it('stores rather than compresses, with both sizes equal', () => {
    const text = 'a'.repeat(500); // would compress hugely, and must not
    const zip = zipText([{ name: 'a.csv', text }], AT);
    expect(u16(zip, 8)).toBe(0);          // method 0
    expect(u32(zip, 18)).toBe(500);       // compressed size
    expect(u32(zip, 22)).toBe(500);       // uncompressed size
    expect(zip.length).toBeGreaterThan(500);
  });

  it('writes the CRC the entry actually has', () => {
    const zip = zipText([{ name: 'a.csv', text: '123456789' }], AT);
    expect(u32(zip, 14)).toBe(0xcbf43926);
  });

  it('flags names as UTF-8 and round-trips one', () => {
    // Without bit 11 an accented name is read as a 1980s code page and arrives
    // mangled — which is how "café.csv" becomes "cafÃ©.csv" on the desktop.
    const zip = zipStore([{ name: 'café.csv', data: bytes('x') }], AT);
    expect(u16(zip, 6) & 0x0800).toBe(0x0800);
    const nameLen = u16(zip, 26);
    const name = new TextDecoder().decode(zip.slice(30, 30 + nameLen));
    expect(name).toBe('café.csv');
    expect(nameLen).toBe(9); // é is two bytes, so the LENGTH is bytes not characters
  });

  it('keeps the file content byte-for-byte after the name', () => {
    const text = 'name,phone\r\n"Whitfield, Dana",555\r\n';
    const zip = zipText([{ name: 'clients.csv', text }], AT);
    const nameLen = u16(zip, 26);
    const stored = new TextDecoder().decode(zip.slice(30 + nameLen, 30 + nameLen + bytes(text).length));
    expect(stored).toBe(text);
  });

  it('packs the DOS timestamp the way the format wants', () => {
    const zip = zipText([{ name: 'a.csv', text: 'x' }], AT);
    const time = u16(zip, 10);
    const date = u16(zip, 12);
    expect(date >> 9).toBe(2026 - 1980);
    expect((date >> 5) & 0xf).toBe(8);   // August
    expect(date & 0x1f).toBe(5);
    expect(time >> 11).toBe(14);
    expect((time >> 5) & 0x3f).toBe(30);
    expect((time & 0x1f) * 2).toBe(20);  // two-second resolution, per the format
  });

  it('clamps a pre-1980 date instead of wrapping it into the future', () => {
    // (year - 1980) is written into 7 bits. 1970 would be -10, which wraps to
    // 118 and dates the file 2098.
    const zip = zipText([{ name: 'a.csv', text: 'x' }], new Date(1970, 0, 1, 0, 0, 0));
    expect(u16(zip, 12) >> 9).toBe(0);
  });

  it('makes an empty archive that is still a valid archive', () => {
    const zip = zipStore([], AT);
    expect(zip.length).toBe(22);
    expect(u32(zip, 0)).toBe(0x06054b50);
    expect(u16(zip, 10)).toBe(0);
  });
});
