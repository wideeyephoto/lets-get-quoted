import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Original LGQ connection cue, synthesized from oscillators (no sampled audio).
// Two rounded bell tones within the telephone speech band; no DTMF pairs.
const sampleRate = 24000;
const seconds = 0.62;
const samples = new Float64Array(Math.round(sampleRate * seconds));
const notes = [
  { start: 0.025, frequency: 659.255, length: 0.38, gain: 0.8 },
  { start: 0.165, frequency: 987.767, length: 0.43, gain: 1 },
];
for (let i = 0; i < samples.length; i++) {
  const time = i / sampleRate;
  for (const note of notes) {
    const t = time - note.start;
    if (t < 0 || t >= note.length) continue;
    const attack = Math.sin(Math.min(1, t / 0.018) * Math.PI / 2) ** 2;
    const release = Math.sin(Math.min(1, (note.length - t) / 0.12) * Math.PI / 2) ** 2;
    const envelope = attack * release * Math.exp(-6 * t) * note.gain;
    const phase = 2 * Math.PI * note.frequency * t;
    samples[i] += envelope * (Math.sin(phase) + 0.09 * Math.sin(phase * 2) + 0.025 * Math.sin(phase * 3));
  }
}
const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
const scale = 0.18 / peak;
const bytes = samples.length * 2;
const wav = Buffer.alloc(44 + bytes);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + bytes, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20); // PCM
wav.writeUInt16LE(1, 22); // mono
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(bytes, 40);
for (let i = 0; i < samples.length; i++) wav.writeInt16LE(Math.round(samples[i] * scale * 32767), 44 + i * 2);
const directory = new URL('../public/audio/', import.meta.url);
mkdirSync(directory, { recursive: true });
const output = new URL('dispatch-connected-v1.wav', directory);
writeFileSync(output, wav);
console.log(JSON.stringify({ file: fileURLToPath(output), seconds, sampleRate, channels: 1, peakDbfs: 20 * Math.log10(0.18), bytes: wav.length }));
