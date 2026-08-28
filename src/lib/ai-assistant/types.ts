export type MessageRole = 'user' | 'assistant' | 'system';

export type ActionCardType =
  | 'quote_created'
  | 'job_updated'
  | 'task_created'
  | 'quote_item_added'
  | 'job_list'
  | 'client_list'
  | 'unpaid_invoices'
  | 'schedule'
  | 'business_summary'
  | 'navigation';

export interface ActionCard {
  type: ActionCardType;
  title: string;
  description?: string;
  linkUrl?: string;
  linkLabel?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

export interface AssistantToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status?: 'pending' | 'done' | 'error';
}

export interface AssistantMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: AssistantToolCall[];
  actionCards?: ActionCard[];
  createdAt: string;
}

export interface ActiveRecordContext {
  type: 'job' | 'client' | 'invoice' | 'schedule' | 'dashboard' | 'other';
  id?: string;
  ref?: string;
  title?: string;
  details?: Record<string, unknown>;
}

export interface AssistantContext {
  userId: string;
  accountId: string;
  role: 'owner' | 'crew' | 'office' | null;
  businessName: string;
  currentPath?: string;
  activeRecord?: ActiveRecordContext;
  timezone?: string;
  capabilities?: string[];
}

export interface AssistantRequestBody {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  currentPath?: string;
  activeRecord?: ActiveRecordContext;
}

export interface AssistantResponseBody {
  message: AssistantMessage;
  actionCards?: ActionCard[];
  error?: string;
}
