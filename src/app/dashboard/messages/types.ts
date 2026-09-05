export type MessageActionResult =
  | { status: 'idle' }
  | { status: 'error'; message: string };
