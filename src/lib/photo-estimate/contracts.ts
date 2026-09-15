export interface PhotoEstimate {
  id: string;
  accountId: string;
  jobId: string;
  creatorId: string;
  trade: string;
  currentInputRevision: number;
  currentReviewRevision: number;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoEstimateInput {
  id: string;
  estimateId: string;
  revision: number;
  notes?: string;
  measurementSources: any[];
  selectedPhotoIds: string[];
  createdBy: string;
  createdAt: string;
}

export interface PhotoEstimateRun {
  id: string;
  estimateId: string;
  inputRevision: number;
  provider: string;
  modelVersion?: string;
  promptVersion?: string;
  schemaVersion?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  leaseToken?: string;
  leaseExpiresAt?: string;
  attemptCount: number;
  result?: any;
  errorCategory?: string;
  usageMetadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoEstimateReview {
  id: string;
  estimateId: string;
  revision: number;
  reviewedFindings: any[];
  dismissedFindings: any[];
  confirmedQuantities: any[];
  serviceSnapshots: any[];
  calculatedLines: any[];
  reviewerId: string;
  createdAt: string;
}

export interface PhotoEstimateQuoteLink {
  id: string;
  estimateId: string;
  reviewRevision: number;
  jobId: string;
  stableQuoteItemId: string;
  sourceLineId: string;
  appliedAt: string;
}

export interface CreateEstimateRequest {
  jobId: string;
  trade: string;
  notes?: string;
  photoIds: string[];
}

export interface UpdateEstimateRequest {
  trade?: string;
  notes?: string;
  photoIds?: string[];
}
