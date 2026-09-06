'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './SiteEditor.module.css';

interface SquarespaceDnsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isApex?: boolean;
  host?: string;
  value?: string;
}

export default function SquarespaceDnsModal({
  isOpen,
  onClose,
  isApex = true,
  host = '@',
  value = '76.76.21.21',
}: SquarespaceDnsModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className={styles.screenshotModalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="squarespace-dns-guide-title"
      onMouseDown={onClose}
    >
      <div
        className={styles.screenshotModal}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className={styles.screenshotModalHead}>
          <div>
            <strong id="squarespace-dns-guide-title">
              Squarespace DNS Settings Walkthrough
            </strong>
            <small>Where to add your custom DNS record in Squarespace Domains</small>
          </div>
          <button
            type="button"
            className={styles.screenshotModalClose}
            onClick={onClose}
            aria-label="Close walkthrough"
          >
            ✕
          </button>
        </div>

        <div className={styles.screenshotModalBody}>
          <div className={styles.screenshotImageContainer}>
            <img
              src="/help/squarespace-dns-settings.jpg"
              alt="Squarespace DNS Settings page showing Custom records section and A record fields"
              className={styles.screenshotImage}
            />
          </div>

          <div className={styles.screenshotAnnotations}>
            <h4 className={styles.screenshotAnnotationsTitle}>
              Step-by-Step Annotations:
            </h4>

            <ol className={styles.annotationList}>
              <li className={styles.annotationItem}>
                <span className={styles.annotationNumber}>1</span>
                <div className={styles.annotationText}>
                  <strong>DNS Presets (Leave as-is):</strong>
                  <p>
                    The top box shows <em>Squarespace Domain Connect</em>. Do not
                    delete or edit this preset; it is managed by Squarespace.
                  </p>
                </div>
              </li>

              <li className={styles.annotationItem}>
                <span className={styles.annotationNumber}>2</span>
                <div className={styles.annotationText}>
                  <strong>Custom records section → Click &ldquo;ADD RECORD&rdquo;:</strong>
                  <p>
                    Scroll down past the presets to <strong>Custom records</strong>,
                    then click the black <strong>ADD RECORD</strong> button on the right
                    to add a new row.
                  </p>
                </div>
              </li>

              <li className={styles.annotationItem}>
                <span className={styles.annotationNumber}>3</span>
                <div className={styles.annotationText}>
                  <strong>Fill in the row fields:</strong>
                  <p>
                    • <strong>TYPE:</strong> Select <code>{isApex ? 'A' : 'CNAME'}</code> from the dropdown.<br />
                    • <strong>NAME:</strong> Enter <code>{host}</code>.<br />
                    • <strong>PRIORITY:</strong> Leave as <code>N/A</code>.<br />
                    • <strong>TTL:</strong> Keep as <code>1 hr</code> (or standard).
                  </p>
                </div>
              </li>

              <li className={styles.annotationItem}>
                <span className={styles.annotationNumber}>4</span>
                <div className={styles.annotationText}>
                  <strong>
                    Paste Value into &ldquo;DATA&rdquo;{' '}
                    <span className={styles.annotationHighlight}>
                      Red Box in Screenshot
                    </span>:
                  </strong>
                  <p>
                    Paste <code>{value}</code> into the <strong>DATA</strong> field
                    (highlighted in the red box in the screenshot).
                  </p>
                </div>
              </li>

              <li className={styles.annotationItem}>
                <span className={styles.annotationNumber}>5</span>
                <div className={styles.annotationText}>
                  <strong>Delete conflicting records &amp; Save:</strong>
                  <p>
                    If you see existing old <code>A</code> or <code>AAAA</code> records
                    for <code>@</code> (such as <code>199.181.197.11</code> / <code>.12</code>),
                    click the trash can icon on those rows to delete them. Click{' '}
                    <strong>Save</strong> at the top right when finished.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </div>

        <div className={styles.screenshotModalFoot}>
          <button
            type="button"
            className={styles.screenshotModalDone}
            onClick={onClose}
          >
            Got it, close guide
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
