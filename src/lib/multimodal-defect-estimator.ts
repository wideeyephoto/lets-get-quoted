import { GoogleGenAI, Type, Schema } from '@google/genai';

export interface DefectItem {
  defectName: string;
  severity: 'minor' | 'moderate' | 'severe' | 'structural';
  recommendedRepair: string;
  estimatedLaborHours: number;
  estimatedMaterialCostDollars: number;
  estimatedTotalDollars: number;
}

export interface PhotoDefectEstimateResult {
  trade: string;
  overallDamageSummary: string;
  defects: DefectItem[];
  totalEstimatedRepairDollars: number;
  urgency: 'routine' | 'urgent' | 'emergency';
  suggestedQuoteDraft: {
    title: string;
    lineItems: Array<{ name: string; cost: number }>;
  };
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
          estimatedLaborHours: { type: Type.NUMBER },
          estimatedMaterialCostDollars: { type: Type.NUMBER },
          estimatedTotalDollars: { type: Type.NUMBER },
        },
        required: [
          'defectName',
          'severity',
          'recommendedRepair',
          'estimatedLaborHours',
          'estimatedMaterialCostDollars',
          'estimatedTotalDollars',
        ],
      },
    },
    totalEstimatedRepairDollars: {
      type: Type.NUMBER,
      description: 'Total estimated cost for all repairs (sum of defect estimatedTotalDollars)',
    },
    urgency: {
      type: Type.STRING,
      enum: ['routine', 'urgent', 'emergency'],
      description: 'The urgency of the required repairs.',
    },
    suggestedQuoteDraft: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Title for the quote' },
        lineItems: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: 'Description of the quote line item' },
              cost: { type: Type.NUMBER, description: 'Cost of the quote line item' },
            },
            required: ['name', 'cost'],
          },
        },
      },
      required: ['title', 'lineItems'],
    },
  },
  required: [
    'trade',
    'overallDamageSummary',
    'defects',
    'totalEstimatedRepairDollars',
    'urgency',
    'suggestedQuoteDraft',
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
    ? `\nHere is the contractor's Price Book. If any of these line items apply to the defects you find, USE EXACTLY these names and costs in your suggested draft quote:\n${priceBook.map(item => `- ${item.name} ($${item.unitPrice}/${item.unit})`).join('\n')}`
    : `\nThe contractor has no explicit price book. Use reasonable industry averages for the draft quote line items.`;

  const prompt = `You are an expert ${trade} estimator and inspector.
Examine the following photos of a job site.

Context notes: ${notes || 'None'}
${priceBookContext}

Identify any defects, damage, or required repairs.
Provide a structured estimate including:
- An overall summary of the damage.
- A list of itemized defects with severity, recommended repairs, labor hours, and material costs.
- The total estimated cost.
- The overall urgency of the repairs.
- A suggested draft quote with line items that can be sent to the customer.`;

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
