'use client';

import { useState } from 'react';
import styles from './siri-hands-free.module.css';

export default function SiriHandsFreeWizard() {
  const [platform, setPlatform] = useState<'ios' | 'android'>('ios');
  const [copied, setCopied] = useState(false);

  const isIos = platform === 'ios';

  function handleDownloadShortcut() {
    // Generate a downloadable iOS shortcut file / config trigger
    const shortcutText = `BEGIN:SHORTCUT\nNAME:Text to Job Intake\nTRIGGER:Hey Siri, Text to Job\nACTION:DICTATE_AND_SEND_SMS\nRECIPIENT:(248) 555-0199\nEND:SHORTCUT`;
    const blob = new Blob([shortcutText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'TextToJob-Siri-Shortcut.txt';
    link.click();
    URL.revokeObjectURL(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.headerRow}>
        <div className={styles.titleGroup}>
          <span className={styles.badge}>🚗 Apple CarPlay & Android Auto Hands-Free Wizard</span>
          <h3 className={styles.title}>Dictate change orders from the steering wheel.</h3>
          <p className={styles.subtitle}>
            Never look at your phone screen while driving on the highway. Set up your steering wheel voice button in 60 seconds with Apple Siri or Google Assistant.
          </p>
        </div>

        {/* Platform Toggle */}
        <div className={styles.systemSwitcher}>
          <button
            type="button"
            onClick={() => setPlatform('ios')}
            className={`${styles.systemBtn} ${isIos ? styles.systemBtnActive : ''}`}
          >
             Apple CarPlay &amp; Siri
          </button>
          <button
            type="button"
            onClick={() => setPlatform('android')}
            className={`${styles.systemBtn} ${!isIos ? styles.systemBtnActive : ''}`}
          >
            🤖 Android Auto &amp; Google
          </button>
        </div>
      </div>

      <div className={styles.wizardGrid}>
        {/* Step-by-Step Instructions */}
        <div className={styles.stepsList}>
          <div className={styles.stepCard}>
            <div className={styles.stepNum}>1</div>
            <div className={styles.stepContent}>
              <h4 className={styles.stepTitle}>
                {isIos ? 'Save Contact in iPhone' : 'Save Contact in Google Contacts'}
              </h4>
              <p className={styles.stepDesc}>
                Add your dedicated platform number (e.g. <code>(248) 555-0199</code>) to your phone
                contacts under the name <strong>“Job Intake”</strong>.
              </p>
            </div>
          </div>

          <div className={styles.stepCard}>
            <div className={styles.stepNum}>2</div>
            <div className={styles.stepContent}>
              <h4 className={styles.stepTitle}>
                {isIos ? 'Activate Siri Hands-Free Trigger' : 'Set Google Assistant Routine'}
              </h4>
              <p className={styles.stepDesc}>
                {isIos
                  ? 'Press the steering wheel voice button or say "Hey Siri, text Job Intake".'
                  : 'Press your steering wheel mic or say "Hey Google, text Job Intake".'}
              </p>
              <div className={styles.voiceSample}>
                {isIos
                  ? '“Hey Siri, text Job Intake: Add $450 to Miller for pantry GFCI line”'
                  : '“Hey Google, text Job Intake: Rough plumbing passed inspection at 124 Main”'}
              </div>
            </div>
          </div>

          <div className={styles.stepCard}>
            <div className={styles.stepNum}>3</div>
            <div className={styles.stepContent}>
              <h4 className={styles.stepTitle}>Instant AI Confirmation</h4>
              <p className={styles.stepDesc}>
                Gemini processes the speech audio in 1.4 seconds and Siri reads back your confirmation:
                <em> “Added $450 electrical line item to Job J-104 (Miller).”</em>
              </p>
            </div>
          </div>
        </div>

        {/* Truck In-Dash CarPlay Display Preview */}
        <div className={styles.carplayDisplay}>
          <div className={styles.carplayStatusBar}>
            <span className={styles.carplayCarModel}>
              {isIos ? ' Apple CarPlay · Truck Cab Ingress' : '🤖 Android Auto · Truck Cab Ingress'}
            </span>
            <span>9:41 AM · LTE 5G</span>
          </div>

          <div className={styles.carplayVoiceActive}>
            <div className={styles.siriOrb}></div>
            <p className={styles.carplayMessage}>
              {isIos
                ? '“What do you want to say to Job Intake?”'
                : '“Listening... dictate your job update.”'}
            </p>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '12.5px',
                color: '#50e3bd',
                fontFamily: 'monospace',
              }}
            >
              “Add $450 to Miller job for extra 12/2 Romex line”
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadShortcut}
            className={styles.shortcutActionBtn}
          >
            {copied ? '✓ Shortcut Guide Downloaded' : isIos ? ' Download Siri Shortcut Guide (.txt)' : '🤖 Download Android Auto Guide (.txt)'}
          </button>
        </div>
      </div>
    </div>
  );
}
