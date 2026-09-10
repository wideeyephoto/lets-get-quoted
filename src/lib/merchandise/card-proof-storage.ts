import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitizeSvgContent } from './card-preflight';
import { verifyQrDecode } from './card-qr';

export const CARD_ARTWORK_BUCKET = 'merchandise-artwork';

/** Rasterize the approved artwork once; fulfillment uses these immutable bytes. */
export async function storeCardArtwork(admin: SupabaseClient, accountId: string, proofId: string, frontSvg: string, backSvg: string, qrDestinationUrl: string) {
  const assets = [];
  try {
  for (const [side, svg] of [['front', frontSvg], ['back', backSvg]] as const) {
    if (typeof svg !== 'string' || Buffer.byteLength(svg) > 2_000_000 || !sanitizeSvgContent(svg).safe) {
      throw new Error('Card artwork contains unsupported content or exceeds the size limit.');
    }
    const input = sharp(Buffer.from(svg), { limitInputPixels: 4_000_000 });
    const metadata = await input.metadata();
    if (metadata.width !== 1125 || metadata.height !== 675) {
      throw new Error('Card artwork must include the 1125 × 675 pixel print area.');
    }
    const png = await input.png().withMetadata({ density: 300 }).toBuffer();
    if (side === 'back') {
      const raw = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const qr = verifyQrDecode(new Uint8ClampedArray(raw.data), raw.info.width, raw.info.height);
      if (!qr.ok || qr.decodedUrl !== qrDestinationUrl) throw new Error('The printed QR code could not be verified. Please review your card.');
    }
    const key = `${accountId}/${proofId}/${side}.png`;
    const { error } = await admin.storage.from(CARD_ARTWORK_BUCKET).upload(key, png, { contentType: 'image/png', upsert: false });
    if (error) throw new Error(`Could not save ${side} card artwork: ${error.message}`);
    assets.push({ key, hash: createHash('sha256').update(png).digest('hex') });
  }
  return { front: assets[0], back: assets[1] };
  } catch (error) {
    if (assets.length) await admin.storage.from(CARD_ARTWORK_BUCKET).remove(assets.map(asset => asset.key));
    throw error;
  }
}

export async function getCardFulfillmentArtwork(admin: SupabaseClient, accountId: string, proofId: string) {
  const { data: proof, error } = await admin.from('merchandise_card_proofs').select('*').eq('id', proofId).eq('account_id', accountId).maybeSingle();
  if (error || !proof?.is_approved || !proof.preflight_passed) throw new Error('Approved card proof is unavailable.');
  const urls: string[] = [];
  for (const [key, hash] of [[proof.front_asset_key, proof.front_asset_hash], [proof.back_asset_key, proof.back_asset_hash]]) {
    if (!key.startsWith(`${accountId}/${proofId}/`)) throw new Error('Artwork ownership mismatch.');
    const { data: blob, error: downloadError } = await admin.storage.from(CARD_ARTWORK_BUCKET).download(key);
    if (downloadError || !blob) throw new Error('Approved artwork could not be loaded.');
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error('Approved artwork checksum mismatch.');
    const { data, error: signError } = await admin.storage.from(CARD_ARTWORK_BUCKET).createSignedUrl(key, 7 * 24 * 60 * 60);
    if (signError || !data?.signedUrl) throw new Error('Could not authorize artwork for fulfillment.');
    urls.push(data.signedUrl);
  }
  return { frontUrl: urls[0], backUrl: urls[1] };
}
