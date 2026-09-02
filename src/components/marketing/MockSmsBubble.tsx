'use client';

import styles from './mock-sms-bubble.module.css';

export type MockSmsBubbleProps = {
  channel: string;
  icon?: string;
  time?: string;
  userMessage: string;
  copilotReply: string;
  actionTag?: string;
};

export default function MockSmsBubble({
  channel,
  icon = '💬',
  time = '2:14 PM',
  userMessage,
  copilotReply,
  actionTag,
}: MockSmsBubbleProps) {
  return (
    <div className={styles.threadContainer}>
      <div className={styles.threadHeader}>
        <span className={styles.channelLabel}>
          <span className={styles.channelIcon} aria-hidden="true">
            {icon}
          </span>
          {channel}
        </span>
        <span className={styles.threadTime}>{time} · Delivered</span>
      </div>

      {/* Outgoing Contractor Message */}
      <div className={styles.bubbleRowOut}>
        <div className={styles.userBubble}>
          <div className={styles.bubbleText}>{userMessage}</div>
        </div>
      </div>

      {/* Incoming Copilot Response */}
      <div className={styles.bubbleRowIn}>
        <div className={styles.copilotBubble}>
          <div className={styles.copilotHeader}>
            <span className={styles.copilotAvatar} aria-hidden="true">
              ⚡
            </span>
            <span className={styles.copilotLabel}>Copilot AI</span>
            {actionTag ? <span className={styles.actionPill}>{actionTag}</span> : null}
          </div>
          <div className={styles.copilotText}>{copilotReply}</div>
        </div>
      </div>
    </div>
  );
}
