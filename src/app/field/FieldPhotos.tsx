'use client';

import { useCallback, useRef, useState } from 'react';

// Photographs, from a phone, over a bad connection.
//
// WHAT THIS REPLACES: a bare <input type="file" multiple> inside a server-action
// form. Every photo went up at full size — a modern phone camera writes 4 to 12
// MB a frame, and the server refused anything over 6 — inside one multipart POST
// with no progress anywhere, and if the third of three failed, all three were
// gone along with the note that was typed above them. On a site connection that
// is not an edge case, it is the normal case.
//
// Four changes, in the order they matter:
//
//   1. COMPRESS FIRST. A 12 MB frame becomes ~400 KB at 1800px/JPEG 82, which
//      is more than enough to prove rotted sheathing and is the difference
//      between an upload that finishes and one that times out. Done before the
//      first byte leaves, so the size limit stops being something a crew member
//      can hit by owning a good phone.
//   2. ONE REQUEST PER PHOTO, uploaded as it is chosen. The note is no longer
//      hostage to the last image.
//   3. PROGRESS, per photo, because a phone that looks idle for ninety seconds
//      gets tapped again.
//   4. FAILURES ARE KEPT. The compressed blob stays in memory with a Retry
//      button against it. Nothing has to be re-photographed, and nothing is
//      silently dropped.
//
// What reaches the form is a set of hidden inputs carrying storage paths, so the
// server action does no uploading at all.

/** Long edge, in pixels. Comfortably past what any of these photos is read at. */
const MAX_EDGE = 1800;
const QUALITY = 0.82;
/** Below this, compressing costs more in artefacts than it saves in bytes. */
const SKIP_UNDER_BYTES = 400 * 1024;

type Item = {
  id: string;
  name: string;
  /** The compressed blob, kept so a retry needs no second trip to the camera. */
  blob: Blob;
  status: 'uploading' | 'done' | 'failed';
  percent: number;
  path?: string;
  error?: string;
};

function newId(): string {
  const cryptoRef = typeof crypto !== 'undefined' ? crypto : undefined;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  return `p${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Shrink a camera frame to something a site connection can actually deliver.
 *
 * createImageBitmap with imageOrientation:'from-image' is what keeps a portrait
 * photo portrait — a canvas draw of a raw JPEG ignores the EXIF rotation flag,
 * which is how "before" shots end up sideways on the owner's screen. Where it
 * isn't available the original file is used untouched: a correctly-oriented
 * large photo beats a small rotated one.
 */
async function compress(file: File): Promise<{ blob: Blob; name: string }> {
  const fallback = { blob: file, name: file.name };
  if (file.size < SKIP_UNDER_BYTES) return fallback;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return fallback;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return fallback;
  }

  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return fallback;
    context.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    // A "compressed" file that grew is not a compressed file. Happens with
    // small screenshots and flat color.
    if (!blob || blob.size >= file.size) return fallback;
    return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
  } finally {
    bitmap.close();
  }
}

/** XHR rather than fetch, for the one thing fetch still cannot do: upload progress. */
function upload(jobId: string, blob: Blob, name: string, onProgress: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append('jobId', jobId);
    body.append('photo', blob, name);

    const request = new XMLHttpRequest();
    request.open('POST', '/field/api/photo');
    request.withCredentials = true;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      try {
        const parsed = JSON.parse(request.responseText || '{}');
        if (request.status >= 200 && request.status < 300 && parsed.path) resolve(parsed.path as string);
        else reject(new Error(parsed.error || `Upload failed (${request.status})`));
      } catch {
        reject(new Error(`Upload failed (${request.status})`));
      }
    };
    request.onerror = () => reject(new Error('No connection. The photo is still on your phone — tap Retry.'));
    request.ontimeout = () => reject(new Error('That took too long. Tap Retry.'));
    request.send(body);
  });
}

export default function FieldPhotos({
  jobId,
  name = 'photoPaths',
  max = 6,
  label = 'Photos',
  hint,
}: {
  jobId: string;
  /** The hidden input name the server action reads the paths from. */
  name?: string;
  max?: number;
  label?: string;
  hint?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const patch = useCallback((id: string, changes: Partial<Item>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  const send = useCallback(
    async (item: Item) => {
      patch(item.id, { status: 'uploading', percent: 0, error: undefined });
      try {
        const path = await upload(jobId, item.blob, item.name, (percent) => patch(item.id, { percent }));
        patch(item.id, { status: 'done', percent: 100, path });
      } catch (error) {
        patch(item.id, { status: 'failed', error: error instanceof Error ? error.message : 'Upload failed.' });
      }
    },
    [jobId, patch],
  );

  const onPick = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const room = Math.max(0, max - items.length);
      const chosen = Array.from(files).slice(0, room);
      // Clearing the input is what lets the same photo be picked twice after a
      // failure, and stops a re-render re-submitting an old selection.
      if (inputRef.current) inputRef.current.value = '';

      for (const file of chosen) {
        const { blob, name: fileName } = await compress(file);
        const item: Item = { id: newId(), name: fileName, blob, status: 'uploading', percent: 0 };
        setItems((current) => [...current, item]);
        void send(item);
      }
    },
    [items.length, max, send],
  );

  const remove = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const done = items.filter((item) => item.status === 'done');
  const full = items.length >= max;

  return (
    <div className="field-photos">
      {/* No `capture` attribute on purpose. It pins the picker to the camera,
          which contradicts `multiple` (iOS then allows exactly one shot) and
          blocks the common case of attaching three photos already taken while
          both hands were busy. accept="image/*" still offers the camera. */}
      <label className="field-photos-pick">
        <span>{label}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          disabled={full}
          aria-label={label}
          onChange={(event) => void onPick(event.target.files)}
        />
      </label>
      {hint ? <small className="field-photos-hint">{hint}</small> : null}
      {full ? <small className="field-photos-hint">That&apos;s the {max}-photo limit for one send.</small> : null}

      {items.length > 0 ? (
        <ul className="field-photos-list">
          {items.map((item) => (
            <li key={item.id} className={`field-photo-item is-${item.status}`}>
              <div className="field-photo-main">
                <strong>{item.name}</strong>
                <span>
                  {item.status === 'uploading'
                    ? `${item.percent}% · ${kb(item.blob.size)}`
                    : item.status === 'done'
                      ? `Uploaded ✓ · ${kb(item.blob.size)}`
                      : item.error}
                </span>
                {item.status === 'uploading' ? (
                  <div className="field-photo-bar" aria-hidden="true">
                    <div className="field-photo-fill" style={{ width: `${item.percent}%` }} />
                  </div>
                ) : null}
              </div>
              {item.status === 'failed' ? (
                <button type="button" className="field-photo-retry" onClick={() => void send(item)}>
                  Retry
                </button>
              ) : null}
              {item.status !== 'uploading' ? (
                <button type="button" className="field-photo-drop" onClick={() => remove(item.id)} aria-label={`Remove ${item.name}`}>
                  ✕
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/* What the server action actually receives. Only uploads that finished
          are here, so a form submitted while one is still going carries the
          ones that made it rather than failing on the one that didn't. */}
      {done.map((item) => (
        <input key={item.id} type="hidden" name={name} value={item.path} />
      ))}

      <p className="sr-only" role="status">
        {items.length === 0
          ? 'No photos attached'
          : `${done.length} of ${items.length} photos uploaded`}
      </p>
    </div>
  );
}
