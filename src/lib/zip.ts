/**
 * A ZIP archive, stored (uncompressed).
 *
 * Written by hand because the alternative was a dependency for something the
 * format makes simple, and because "export everything" has to be ONE file. A
 * button that fires four downloads gets two of them blocked by the browser and
 * the contractor never finds out which two.
 *
 * Stored rather than deflated on purpose: no compression means no compression
 * library, and these are CSVs a person opens once and feeds back into an
 * importer — the saving would buy nothing anybody notices. Every real unzip
 * reads method 0; it is the same format an unmodified `zip -0` produces.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

/** The standard CRC-32 every ZIP entry carries. `crc32("123456789")` is 0xcbf43926. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array };

/**
 * MS-DOS packed date and time — the only timestamp the base format has.
 *
 * Two-second resolution and no timezone, which is the format's limit rather
 * than ours. Clamped at 1980 because that is where the epoch starts and a date
 * below it wraps into a year in the future.
 */
function dosStamp(when: Date): { time: number; date: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

/** Little-endian writer, because that is what every field in the format is. */
class ByteWriter {
  private parts: Uint8Array[] = [];
  length = 0;
  u16(value: number) { this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff])); }
  u32(value: number) { this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff])); }
  bytes(value: Uint8Array) { this.push(value); }
  private push(part: Uint8Array) { this.parts.push(part); this.length += part.length; }
  done(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) { out.set(part, at); at += part.length; }
    return out;
  }
}

const utf8 = (value: string) => new TextEncoder().encode(value);

// Bit 11 says the filename is UTF-8. Without it a name with an accent in it is
// read as the 1980s code page and arrives mangled.
const UTF8_NAMES = 0x0800;

export function zipStore(entries: ZipEntry[], when: Date): Uint8Array {
  const { time, date } = dosStamp(when);
  const out = new ByteWriter();
  const directory: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];

  for (const entry of entries) {
    const name = utf8(entry.name);
    const crc = crc32(entry.data);
    directory.push({ name, crc, size: entry.data.length, offset: out.length });

    out.u32(0x04034b50); // local file header
    out.u16(20);         // version needed
    out.u16(UTF8_NAMES);
    out.u16(0);          // method 0 — stored
    out.u16(time);
    out.u16(date);
    out.u32(crc);
    out.u32(entry.data.length); // compressed
    out.u32(entry.data.length); // uncompressed — the same, because stored
    out.u16(name.length);
    out.u16(0);          // no extra field
    out.bytes(name);
    out.bytes(entry.data);
  }

  const directoryAt = out.length;
  for (const item of directory) {
    out.u32(0x02014b50); // central directory header
    out.u16(20);         // version made by
    out.u16(20);         // version needed
    out.u16(UTF8_NAMES);
    out.u16(0);
    out.u16(time);
    out.u16(date);
    out.u32(item.crc);
    out.u32(item.size);
    out.u32(item.size);
    out.u16(item.name.length);
    out.u16(0);          // extra
    out.u16(0);          // comment
    out.u16(0);          // disk number
    out.u16(0);          // internal attributes
    out.u32(0);          // external attributes
    out.u32(item.offset);
    out.bytes(item.name);
  }
  const directorySize = out.length - directoryAt;

  out.u32(0x06054b50); // end of central directory
  out.u16(0);          // this disk
  out.u16(0);          // disk with the directory
  out.u16(directory.length);
  out.u16(directory.length);
  out.u32(directorySize);
  out.u32(directoryAt);
  out.u16(0);          // no comment

  return out.done();
}

/** Convenience for the common case: a set of named text files. */
export function zipText(files: { name: string; text: string }[], when: Date): Uint8Array {
  return zipStore(files.map((file) => ({ name: file.name, data: utf8(file.text) })), when);
}
