import { GoogleGenAI, Type, Schema } from '@google/genai';

export interface DefectItem {
  defectName: string;
  severity: 'minor' | 'moderate' | 'severe' | 'structural';
  recommendedRepair: string;
  suggestedServiceId?: string;
  suggestedQuantity?: number;
  uncertaintyExplanation?: string;
  missingInformation?: string;
}

export interface PhotoDefectEstimateResult {
  trade: string;
  overallDamageSummary: string;
  defects: DefectItem[];
  urgency: 'routine' | 'urgent' | 'emergency';
}

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    trade: {
      type: Type.STRING,
      description: 'The trade or specialty this work falls under',
    },
    overallDamageSummary: {
      type: Type.STRING,
      description: 'A 1-3 sentence summary of the observed damage across all photos.',
    },
    defects: {
      type: Type.ARRAY,
      description: 'List of specific defects identified.',
      items: {
        type: Type.OBJECT,
        properties: {
          defectName: { type: Type.STRING },
          severity: {
            type: Type.STRING,
            enum: ['minor', 'moderate', 'severe', 'structural'],
          },
          recommendedRepair: { type: Type.STRING },
          suggestedServiceId: { type: Type.STRING, description: 'Optional ID of the most relevant service from the price book, if provided.' },
          suggestedQuantity: { type: Type.NUMBER, description: 'Optional suggested quantity for the recommended repair, if calculable.' },
          uncertaintyExplanation: { type: Type.STRING, description: 'Explanation of any uncertainty about the defect or repair.' },
          missingInformation: { type: Type.STRING, description: 'Any missing information needed to confidently price this repair.' },
        },
        required: [
          'defectName',
          'severity',
          'recommendedRepair',
        ],
      },
    },
    urgency: {
      type: Type.STRING,
      enum: ['routine', 'urgent', 'emergency'],
      description: 'The urgency of the required repairs.',
    },
  },
  required: [
    'trade',
    'overallDamageSummary',
    'defects',
    'urgency',
  ],
};

async function fetchImageAsPart(url: string) {
  // If it's a data URI, parse it
  if (url.startsWith('data:')) {
    const [header, base64] = url.split(',');
    const mimeType = header.split(':')[1].split(';')[0];
    return {
      inlineData: {
        data: base64,
        mimeType,
      },
    };
  }

  // Otherwise, fetch it and convert to base64
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get('content-type') || 'image/jpeg';
  
  return {
    inlineData: {
      data: buffer.toString('base64'),
      mimeType,
    },
  };
}

/**
 * Analyzes visual defects from homeowner or field photos and generates structured quote line items.
 */
export async function analyzePhotoDefectsAndEstimate(params: {
  trade: string;
  photoUrls?: string[];
  notes?: string;
  priceBook?: { id: string; name: string; unitPrice: number; unit: string }[];
}): Promise<PhotoDefectEstimateResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const { trade, notes, photoUrls, priceBook } = params;

  if (!photoUrls || photoUrls.length === 0) {
    throw new Error('A damage or inspection photo is required to run the AI defect estimator.');
  }

  if (!apiKey) {
    throw new Error('AI photo analysis is currently undergoing upgrades to support true multimodal processing. Please proceed with a manual quote for this job.');
  }

  const ai = new GoogleGenAI({ apiKey });

  const imageParts = await Promise.all(photoUrls.map(fetchImageAsPart));

  const priceBookContext = priceBook && priceBook.length > 0
    ? `\nHere is the contractor's Price Book (ID: Name ($Price/Unit)). If any of these services apply to the defects you find, include the exact service ID in 'suggestedServiceId' and the required quantity in 'suggestedQuantity':\n${priceBook.map(item => `- ${item.id}: ${item.name} ($${item.unitPrice}/${item.unit})`).join('\n')}`
    : `\nThe contractor has no explicit price book. Provide repair recommendations without specific service IDs.`;

  const prompt = `You are an expert ${trade} estimator and inspector.
Examine the following photos of a job site.

Context notes: ${notes || 'None'}
${priceBookContext}

Identify any defects, damage, or required repairs.
Provide a structured estimate including:
- An overall summary of the damage.
- A list of itemized defects with severity, recommended repairs, and suggested services/quantities (if known).
- Note any uncertainty or missing information for pricing.
- The overall urgency of the repairs.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          ...imageParts,
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema,
      temperature: 0.2,
    },
  });

  const responseText = response.text;
  if (!responseText) {
    throw new Error('Failed to generate a valid estimate from the provided photos.');
  }

  try {
    const result = JSON.parse(responseText) as PhotoDefectEstimateResult;
    return result;
  } catch (error) {
    console.error('Failed to parse Gemini response:', responseText);
    throw new Error('Failed to parse estimate data from AI.');
  }
}
