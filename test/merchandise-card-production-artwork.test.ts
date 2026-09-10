import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { renderCardArtwork, type CardDesignDocument } from '@/lib/merchandise/card-renderer';
import { generateCardQrSvg } from '@/lib/merchandise/card-qr';
import { storeCardArtwork } from '@/lib/merchandise/card-proof-storage';

describe('Approved production artwork', () => {
  it.each(['clean', 'bold', 'booking'] as const)('rasterizes and decodes the actual printed QR in the %s layout', async templateId => {
    const destinationUrl = 'https://example.com/request-quote';
    const doc: CardDesignDocument = { version: 1, templateId, content: { businessName: 'Example Plumbing', phone: '5125550100', website: 'example.com' },
      colors: { accentColor: '#0284c7', secondaryColor: '#0f172a' }, qr: { destinationUrl, qrSvg: await generateCardQrSvg(destinationUrl, { sizePx: 300, margin: 4 }) } };
    const artwork = renderCardArtwork(doc);
    const upload = vi.fn().mockResolvedValue({ error: null });
    const admin = { storage: { from: () => ({ upload, remove: vi.fn() }) } };
    const saved = await storeCardArtwork(admin as never, 'account', 'proof', artwork.frontSvg, artwork.backSvg, destinationUrl);
    expect(saved.front.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(upload).toHaveBeenCalledTimes(2);
    const metadata = await sharp(upload.mock.calls[1][1]).metadata();
    expect(metadata).toMatchObject({ width: 1125, height: 675, density: 300, format: 'png' });
  });
  it('refuses an undecodable proof instead of saving a placeholder QR', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const admin = { storage: { from: () => ({ upload, remove }) } };
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1125" height="675"><rect width="1125" height="675" fill="white"/></svg>';
    await expect(storeCardArtwork(admin as never, 'account', 'proof', svg, svg, 'https://example.com')).rejects.toThrow(/QR/);
    expect(remove).toHaveBeenCalledWith(['account/proof/front.png']);
  });
});
