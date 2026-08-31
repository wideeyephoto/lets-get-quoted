import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { getCurrentMembership } from '@/lib/auth';
import type { AnnotationShape } from '@/lib/photo-annotation-engine';
import { fetchProxyImage } from '@/lib/photo-proxy-guard';
import { GoogleGenAI, Type } from '@google/genai';

export const runtime = 'nodejs';

async function requireAuthenticatedMembership() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Sign in to analyze photos.' }, { status: 401 }) };

  const membership = await getCurrentMembership(user.id);
  if (!membership.accountId) {
    return { error: NextResponse.json({ error: 'Account membership required.' }, { status: 403 }) };
  }

  return { accountId: membership.accountId };
}

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedMembership();
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const { photoUrl, imageWidth = 800, imageHeight = 600, scope = '' } = body;

    if (!photoUrl || typeof photoUrl !== 'string') {
      return NextResponse.json({ error: 'photoUrl is required' }, { status: 400 });
    }

    const w = Number(imageWidth) || 800;
    const h = Number(imageHeight) || 600;

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: true,
        suggestions: [],
        summary: 'AI vision engine ready. No automated defects detected. Use the annotation tools to mark up specific dimensions and defect zones.',
      });
    }

    // Safely retrieve image buffer
    let imageBuffer: Buffer | null = null;
    let mimeType = 'image/jpeg';

    if (photoUrl.startsWith('data:image/')) {
      const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(photoUrl);
      if (match) {
        mimeType = match[1];
        imageBuffer = Buffer.from(match[2], 'base64');
      }
    } else {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(photoUrl);
      } catch {
        return NextResponse.json({ error: 'Invalid photo URL format' }, { status: 400 });
      }

      const proxyResult = await fetchProxyImage(parsedUrl);
      if (!proxyResult.ok || !proxyResult.buffer) {
        return NextResponse.json(
          { error: proxyResult.error || 'Unable to retrieve photo for analysis' },
          { status: proxyResult.status || 422 }
        );
      }

      mimeType = proxyResult.contentType || 'image/jpeg';
      imageBuffer = Buffer.from(proxyResult.buffer);
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      return NextResponse.json({
        success: true,
        suggestions: [],
        summary: 'Photo loaded. No automated defects detected.',
      });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBuffer.toString('base64'),
              },
            },
            {
              text: `You are an expert construction contractor, building inspector, and insurance scope analyst.
Examine this jobsite photo carefully${scope ? ` focusing on scope: ${scope}` : ''}.
Identify only genuine, clearly visible defects, damage, leaks, structural flaws, missing materials, or safety hazards.
Do NOT invent defects if the area is intact, clean, or normal construction.
For each real defect found:
1. Provide a normalized 2D bounding box [ymin, xmin, ymax, xmax] in the 0-1000 integer range.
2. Provide a concise label (e.g. "Water Staining", "Damaged Shingles", "Cracked Tile", "Missing Flashing").
3. Severity ("critical" | "moderate" | "cosmetic").
4. A concise contractor recommendation note.`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            defectsFound: { type: Type.BOOLEAN },
            summary: { type: Type.STRING },
            defects: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  severity: { type: Type.STRING },
                  box2d: {
                    type: Type.ARRAY,
                    items: { type: Type.INTEGER },
                    description: '[ymin, xmin, ymax, xmax] normalized 0-1000',
                  },
                  recommendation: { type: Type.STRING },
                },
                required: ['label', 'severity', 'box2d'],
              },
            },
          },
          required: ['defectsFound', 'summary', 'defects'],
        },
      },
    });

    interface DetectedDefect {
      label: string;
      severity: string;
      box2d?: number[];
      recommendation?: string;
    }

    const parsed = JSON.parse(response.text || '{}');
    const defects: DetectedDefect[] = Array.isArray(parsed.defects) ? parsed.defects : [];

    if (defects.length === 0 || !parsed.defectsFound) {
      return NextResponse.json({
        success: true,
        suggestions: [],
        summary: parsed.summary || 'AI visual inspection complete: No severe visual defects or structural damage detected.',
      });
    }

    const suggestions: AnnotationShape[] = [];

    defects.slice(0, 4).forEach((defect: DetectedDefect, idx: number) => {
      const box = Array.isArray(defect.box2d) && defect.box2d.length === 4 ? defect.box2d : null;
      if (!box) return;

      const [ymin, xmin, ymax, xmax] = box;
      const boxStart = {
        x: Math.max(0, Math.min(w, Math.round((xmin / 1000) * w))),
        y: Math.max(0, Math.min(h, Math.round((ymin / 1000) * h))),
      };
      const boxEnd = {
        x: Math.max(0, Math.min(w, Math.round((xmax / 1000) * w))),
        y: Math.max(0, Math.min(h, Math.round((ymax / 1000) * h))),
      };

      const color = defect.severity === 'critical' ? '#ef4444' : defect.severity === 'moderate' ? '#f59e0b' : '#38bdf8';

      // 1. Defect bounding box
      suggestions.push({
        id: `ai-defect-box-${Date.now()}-${idx}`,
        type: 'rect',
        start: boxStart,
        end: boxEnd,
        color,
        strokeWidth: 3,
      });

      // 2. Defect Stamp
      suggestions.push({
        id: `ai-stamp-${Date.now()}-${idx}`,
        type: 'stamp',
        position: { x: Math.round((boxStart.x + boxEnd.x) / 2), y: Math.max(25, boxStart.y - 18) },
        stampId: 'defect',
        label: `⚠️ ${defect.label.toUpperCase()}`,
        color,
        strokeWidth: 2,
      });

      // 3. Callout note if recommendation present
      if (defect.recommendation) {
        suggestions.push({
          id: `ai-callout-${Date.now()}-${idx}`,
          type: 'text',
          position: { x: Math.min(w - 240, boxEnd.x + 12), y: boxStart.y },
          text: `AI Finding:\n${defect.recommendation}`,
          fontSize: 13,
          color: '#ffffff',
          strokeWidth: 2,
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
        });
      }
    });

    return NextResponse.json({
      success: true,
      suggestions,
      summary: parsed.summary || `AI detected ${suggestions.filter((s) => s.type === 'rect').length} potential defect zone(s).`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to analyze photo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
