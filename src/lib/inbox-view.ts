/**
 * What the inbox says when there is nothing in the list, and what a screen
 * reader hears when it reaches a conversation.
 *
 * Pure, and here rather than in the page, because both are strings with rules
 * in them and the page is a server component nothing can call.
 */

export type InboxFilter = 'all' | 'unread' | 'reply';

/**
 * An empty list has four different meanings and the page said one thing for
 * all of them.
 *
 * "No conversations yet. When a customer texts you, their message shows up
 * here" is TRUE on a fresh account and false in the other three cases — on
 * Unread it appears while thirty conversations sit one tab away, which reads
 * as the inbox having lost them. The distinction the copy has to make is
 * whether the inbox is empty or the FILTER is.
 */
export function inboxEmptyState(input: {
  /** How many conversations exist before the filter and the search. */
  total: number;
  filter: InboxFilter;
  query: string;
}): { title: string; body: string; clear: boolean } {
  const query = input.query.trim();

  if (input.total === 0) {
    return {
      title: 'No conversations yet',
      body: 'When a customer texts you, their message shows up here — or start one yourself with New message.',
      clear: false,
    };
  }

  // Search beats the filter in the copy because it is the narrower of the two
  // and the one they typed a second ago.
  if (query) {
    return {
      title: `No matches for “${query}”`,
      body: 'Search looks at customer names, numbers and the last message in each thread.',
      clear: true,
    };
  }

  if (input.filter === 'unread') {
    return {
      title: 'You’re all caught up',
      body: 'Every conversation has been opened. New texts land here the moment they arrive.',
      clear: true,
    };
  }

  if (input.filter === 'reply') {
    return {
      title: 'Nothing is waiting on you',
      body: 'You had the last word in every conversation. A thread reappears here when a customer texts back.',
      clear: true,
    };
  }

  // filter=all with no query and a non-zero total cannot be empty, but a
  // sentence beats a blank panel if it ever is.
  return { title: 'No conversations to show', body: 'Nothing matches the current view.', clear: true };
}

/**
 * The accessible name of a row in the conversation list.
 *
 * The link's own content is a name, a timestamp, a clipped preview and
 * sometimes a badge, and a screen reader tabbing the list read all of it —
 * "Kendra Willis Aug 4 12:02 You: Thanks, I have booked you in for Tuesday
 * morning, see you then 3 unread" — for every row, which is how a list of
 * twelve becomes unnavigable. The preview is still in the DOM and still read
 * in browse mode; this is only what the ROW announces as a link.
 */
export function conversationLinkLabel(input: {
  name: string;
  unread: number;
  /** Already formatted for display — this never parses a date. */
  when: string;
}): string {
  const parts = [input.name];
  if (input.unread > 0) parts.push(`${input.unread} unread`);
  parts.push(input.when);
  return parts.join(', ');
}
