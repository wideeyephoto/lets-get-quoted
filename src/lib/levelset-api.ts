export type FilingType = 'NOI' | 'LIEN' | 'PRELIM';

export interface LevelsetOrderRequest {
  jobId: string;
  invoiceId?: string;
  filingType: FilingType;
  propertyAddress: string;
  customerName: string;
  claimAmount: number;
}

export interface LevelsetOrderResponse {
  success: boolean;
  orderId?: string;
  status?: string;
  error?: string;
}

/**
 * Mocks a request to the Levelset / zlien API to physically mail or record a document.
 */
export async function placeLevelsetOrder(request: LevelsetOrderRequest): Promise<LevelsetOrderResponse> {
  // In a real implementation, this would:
  // 1. Authenticate with the Levelset API (process.env.LEVELSET_API_KEY)
  // 2. Create/sync the Job location if it doesn't exist
  // 3. Dispatch an order for the specific filing type
  // 4. Return the tracking/order ID

  console.log('[Levelset API] Placing order...', request);
  
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Simulate success
  const fakeOrderId = `LS-ORD-${Math.floor(Math.random() * 1000000)}`;
  
  return {
    success: true,
    orderId: fakeOrderId,
    status: 'processing',
  };
}

/**
 * Gets the current status of an order (e.g. 'mailed', 'recorded').
 */
export async function getLevelsetOrderStatus(orderId: string): Promise<string> {
  // Mock tracking
  return 'mailed';
}
