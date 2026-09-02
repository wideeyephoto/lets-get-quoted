'use client';

import React, { useEffect, useState } from 'react';
import styles from './flagship-product-tour.module.css';

const SCENE_DURATIONS = [5500, 5500, 4500, 5500, 6000, 3500, 6500, 5000, 5000, 3000];

type Props = {
  initialScene?: number;
  autoplay?: boolean;
};

export default function FlagshipProductTourReel({ initialScene = 0, autoplay = true }: Props) {
  const [currentScene, setCurrentScene] = useState<number>(initialScene);
  const [typedText, setTypedText] = useState<string>('');

  useEffect(() => {
    if (!autoplay) return;

    let sceneTimer: NodeJS.Timeout;
    const advance = (idx: number) => {
      const duration = SCENE_DURATIONS[idx] || 5000;
      sceneTimer = setTimeout(() => {
        const next = (idx + 1) % 10;
        setCurrentScene(next);
        advance(next);
      }, duration);
    };

    advance(currentScene);

    return () => clearTimeout(sceneTimer);
  }, [autoplay, currentScene]);

  useEffect(() => {
    (window as any).setReelScene = (idx: number) => {
      setCurrentScene(idx);
    };
  }, []);

  return (
    <div className={styles.reelShell} data-reel-ready="true" data-current-scene={currentScene}>
      <div className={styles.ambientBg} />
      <div className={styles.ambientGrid} />

      {/* SCENE 0: Homeowner Request */}
      {currentScene === 0 && (
        <div className={styles.sceneContainer}>
          <div className={styles.mobileSplitLayout}>
            <div className={styles.mobileFrame}>
              <div className={styles.mobileIsland} />
              <div className={styles.mobileStatus}><span>9:41</span><span>5G ▮▮▮</span></div>
              <div className={styles.mobileScreen}>
                <div className={styles.mobileContent}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #ff7a21, #e05e00)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800 }}>⚡</div>
                    <div>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Northline Electric</h3>
                      <p style={{ fontSize: 11, color: '#99a2b2' }}><span style={{ color: '#ffd166' }}>★ 4.9 (84)</span> · Royal Oak, MI</p>
                    </div>
                  </div>

                  <div style={{ background: 'rgba(20,27,40,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: 14 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#ff7a21', background: 'rgba(255,122,33,0.12)', padding: '3px 8px', borderRadius: 999 }}>✨ AI Instant Estimate</span>
                    <h2 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '8px 0 4px', fontFamily: 'Space Grotesk, sans-serif' }}>Get a ballpark estimate</h2>
                    <p style={{ fontSize: 11.5, color: '#99a2b2', marginBottom: 12 }}>Describe what you need. AI scopes the work and calculates an instant price range.</p>

                    <div style={{ background: 'rgba(8,12,19,0.9)', border: '1.5px solid #ff7a21', borderRadius: 10, padding: 10, minHeight: 70, fontSize: 12.5, color: '#fff', marginBottom: 12, lineHeight: 1.4 }}>
                      {typedText}<span style={{ opacity: 0.7 }}>|</span>
                    </div>

                    <button style={{ width: '100%', height: 40, background: 'linear-gradient(180deg, #ff7a21, #f0640a)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                      Start my estimate →
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.sideContext}>
              <span className={styles.sideEyebrow}>01 · HOMEOWNER INTAKE</span>
              <h1 className={styles.sideTitle}>One description unlocks the whole job.</h1>
              <p className={styles.sideDesc}>The homeowner writes in plain English on the contractor’s mobile-ready site. The system immediately analyzes the scope.</p>
              <div className={styles.sideBulletList}>
                <div className={styles.sideBullet}><span className={styles.sideBulletCheck}>✓</span> Fast 10-second intake experience</div>
                <div className={styles.sideBullet}><span className={styles.sideBulletCheck}>✓</span> Matches contractor’s trade & catalog</div>
                <div className={styles.sideBullet}><span className={styles.sideBulletCheck}>✓</span> Zero spam or generic placeholders</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCENE 1: AI Scoping Questions */}
      {currentScene === 1 && (
        <div className={styles.sceneContainer}>
          <div className={styles.mobileSplitLayout}>
            <div className={styles.mobileFrame}>
              <div className={styles.mobileIsland} />
              <div className={styles.mobileStatus}><span>9:41</span><span>5G ▮▮▮</span></div>
              <div className={styles.mobileScreen}>
                <div className={styles.mobileContent}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ alignSelf: 'flex-end', background: '#ff7a21', color: '#fff', borderRadius: '12px 12px 2px 12px', padding: '8px 12px', fontSize: 12, fontWeight: 600 }}>
                      We’d like recessed lighting added to our kitchen.
                    </div>

                    <div style={{ background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px 12px 12px 2px', padding: '10px 12px', fontSize: 12 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: '#ff7a21', textTransform: 'uppercase', marginBottom: 2 }}>✨ Question 1 of 3 · Fixture Count</div>
                      How many recessed lights would you like installed?
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <span style={{ background: 'rgba(61,214,140,0.2)', border: '1px solid #3dd68c', color: '#fff', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>✓ 8 Recessed Lights</span>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px 12px 12px 2px', padding: '10px 12px', fontSize: 12 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: '#ff7a21', textTransform: 'uppercase', marginBottom: 2 }}>✨ Question 2 of 3 · Ceiling Access</div>
                      What is directly above your kitchen ceiling?
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <span style={{ background: 'rgba(61,214,140,0.2)', border: '1px solid #3dd68c', color: '#fff', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>✓ Finished room above</span>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(30,41,59,0.9)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px 12px 12px 2px', padding: '10px 12px', fontSize: 12 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: '#ff7a21', textTransform: 'uppercase', marginBottom: 2 }}>✨ Question 3 of 3 · Controls</div>
                      Would you like digital dimmer switch controls?
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <span style={{ background: 'rgba(61,214,140,0.2)', border: '1px solid #3dd68c', color: '#fff', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>✓ Yes, Lutron dimmers</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.sideContext}>
              <span className={styles.sideEyebrow}>02 · AI SMART SCOPING</span>
              <h1 className={styles.sideTitle}>AI asks only what changes the price.</h1>
              <p className={styles.sideDesc}>Instead of long static forms, the intake adapts dynamically to clarify fixture count, ceiling joist access, and switch controls.</p>
              <div className={styles.sideBulletList}>
                <div className={styles.sideBullet}><span className={styles.sideBulletCheck}>✓</span> Identifies joist bay cable fishing requirements</div>
                <div className={styles.sideBullet}><span className={styles.sideBulletCheck}>✓</span> Extracts line items before the contractor calls</div>
                <div className={styles.sideBullet}><span className={styles.sideBulletCheck}>✓</span> Guarantees accurate preliminary numbers</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCENE 2: Instant Ballpark Estimate */}
      {currentScene === 2 && (
        <div className={styles.sceneContainer}>
          <div className={styles.mobileSplitLayout}>
            <div className={styles.mobileFrame}>
              <div className={styles.mobileIsland} />
              <div className={styles.mobileStatus}><span>9:41</span><span>5G ▮▮▮</span></div>
              <div className={styles.mobileScreen}>
                <div className={styles.mobileContent}>
                  <div style={{ background: 'linear-gradient(180deg, #162234 0%, #0d1522 100%)', border: '1.5px solid #3dd68c', borderRadius: 16, padding: 18, textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 24px rgba(61,214,140,0.2)' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: '#3dd68c', background: 'rgba(61,214,140,0.15)', padding: '3px 10px', borderRadius: 999 }}>✓ AI Ballpark Ready</span>
                    <div style={{ fontSize: 12, color: '#a0aec0', fontWeight: 600, marginTop: 8 }}>Estimated Range</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#ffffff', fontFamily: 'Space Grotesk, sans-serif', margin: '4px 0' }}>$3,000 – $5,000</div>
                    <p style={{ fontSize: 11, color: '#99a2b2', lineHeight: 1.4, marginBottom: 14 }}>Based on 8 recessed LED pot lights, wire fishing through finished joists, and Lutron dimmers in Royal Oak, MI.</p>

                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 10, marginBottom: 12, textAlign: 'left', fontSize: 12 }}>
                      <div style={{ color: '#fff', fontWeight: 700 }}>Alex Morgan</div>
                      <div style={{ color: '#99a2b2', fontSize: 11 }}>421 Elmhurst Ave · (248) 555-0199</div>
                    </div>

                    <button style={{ width: '100%', height: 38, background: 'linear-gradient(180deg, #ff7a21, #f0640a)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 12.5 }}>
                      ✓ Estimate Request Submitted
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.sideContext}>
              <span className={styles.sideEyebrow}>03 · INSTANT ESTIMATE</span>
              <h1 className={styles.sideTitle}>A preliminary range sets expectations.</h1>
              <p className={styles.sideDesc}>The homeowner receives an instant estimated range on screen and enters their verified contact info to request a firm quote.</p>
              <div className={styles.sideBulletList}>
                <div className={styles.sideBullet}><span className={styles.sideBulletCheck}>✓</span> Transparent price expectations prevent sticker shock</div>
                <div className={styles.sideBullet}><span className={styles.sideBulletCheck}>✓</span> Clear distinction between estimate range & final contractor quote</div>
                <div className={styles.sideBullet}><span className={styles.sideBulletCheck}>✓</span> Homeowner contact details verified immediately</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCENE 3: Contractor Leads Inbox */}
      {currentScene === 3 && (
        <div className={styles.sceneContainer}>
          <div className={styles.desktopWindow}>
            <div className={styles.windowHeader}>
              <div className={styles.windowDots}>
                <span className={[styles.windowDot, styles.dotRed].join(' ')} />
                <span className={[styles.windowDot, styles.dotYellow].join(' ')} />
                <span className={[styles.windowDot, styles.dotGreen].join(' ')} />
              </div>
              <div className={styles.windowTitle}>
                <span>⚡ Northline Electric Dashboard</span>
                <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                <span>https://northline.letsgetquoted.com/dashboard/leads</span>
              </div>
              <div className={styles.userPill}>Brett Miller · Royal Oak, MI</div>
            </div>

            <div className={styles.windowBody}>
              <div className={styles.sidebar}>
                <div className={styles.brandArea}>
                  <div className={styles.brandIcon}>Q</div>
                  <span className={styles.brandName}>Let’s Get Quoted</span>
                </div>
                <div className={styles.navList}>
                  <div className={[styles.navItem, styles.navItemActive].join(' ')}>
                    <span>📥 Leads</span>
                    <span className={styles.navBadge}>1 NEW</span>
                  </div>
                  <div className={styles.navItem}><span>📄 Quotes</span></div>
                  <div className={styles.navItem}><span>🔨 Jobs</span></div>
                  <div className={styles.navItem}><span>📊 Insights</span></div>
                </div>
              </div>

              <div className={styles.mainArea}>
                <div className={styles.topNav}>
                  <h1 className={styles.pageHeading}>Leads Inbox</h1>
                  <span style={{ fontSize: 12, color: '#99a2b2' }}>1 new qualified lead organized and ready to quote</span>
                </div>

                <div className={styles.scrollArea}>
                  <div className={styles.cardTable}>
                    <div className={[styles.tableRow, styles.tableHeader].join(' ')}>
                      <span>Homeowner</span>
                      <span>Project Request</span>
                      <span>Location</span>
                      <span>AI Ballpark</span>
                      <span>Priority</span>
                      <span>Action</span>
                    </div>

                    <div className={[styles.tableRow, styles.rowHighlighted].join(' ')}>
                      <div className={styles.avatarCell}>
                        <div className={styles.avatarCircle}>AM</div>
                        <div>
                          <strong style={{ color: '#fff' }}>Alex Morgan</strong>
                          <div style={{ fontSize: 11, color: '#99a2b2' }}>(248) 555-0199</div>
                        </div>
                      </div>
                      <div>
                        <strong style={{ color: '#fff' }}>8 Recessed Kitchen Lights</strong>
                        <div style={{ fontSize: 11, color: '#99a2b2' }}>Finished ceiling · Lutron dimmers</div>
                      </div>
                      <div>
                        <span>Royal Oak, MI</span>
                        <div style={{ fontSize: 11, color: '#3dd68c' }}>1.2 mi on route</div>
                      </div>
                      <div>
                        <strong style={{ color: '#ff7a21' }}>$3,000 – $5,000</strong>
                      </div>
                      <div>
                        <span className={styles.scoreBadge}>🔥 96 HOT</span>
                      </div>
                      <div>
                        <button style={{ background: '#ff7a21', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 6, fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}>
                          Prepare Quote →
                        </button>
                      </div>
                    </div>

                    <div className={styles.tableRow}>
                      <div className={styles.avatarCell}>
                        <div className={styles.avatarCircle} style={{ background: '#6366f1' }}>TC</div>
                        <div>
                          <strong style={{ color: '#fff' }}>Thomas Clark</strong>
                          <div style={{ fontSize: 11, color: '#99a2b2' }}>(248) 555-0144</div>
                        </div>
                      </div>
                      <div>
                        <strong style={{ color: '#fff' }}>200A Panel Upgrade & EV Charger</strong>
                        <div style={{ fontSize: 11, color: '#99a2b2' }}>Garage subpanel install</div>
                      </div>
                      <div>Berkley, MI</div>
                      <div>$4,200 – $6,500</div>
                      <div><span className={styles.scoreBadge} style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', borderColor: 'transparent' }}>91 GOOD</span></div>
                      <div><button style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 6, fontSize: 11.5 }}>View</button></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCENE 4: Quote Builder & Pricing */}
      {currentScene === 4 && (
        <div className={styles.sceneContainer}>
          <div className={styles.desktopWindow}>
            <div className={styles.windowHeader}>
              <div className={styles.windowDots}>
                <span className={[styles.windowDot, styles.dotRed].join(' ')} />
                <span className={[styles.windowDot, styles.dotYellow].join(' ')} />
                <span className={[styles.windowDot, styles.dotGreen].join(' ')} />
              </div>
              <div className={styles.windowTitle}>Quote Builder — Quote #Q-1048 (Alex Morgan)</div>
              <div className={styles.userPill}>Northline Electric</div>
            </div>

            <div className={styles.windowBody}>
              <div className={styles.sidebar}>
                <div className={styles.brandArea}>
                  <div className={styles.brandIcon}>Q</div>
                  <span className={styles.brandName}>Let’s Get Quoted</span>
                </div>
                <div className={styles.navList}>
                  <div className={styles.navItem}><span>📥 Leads</span></div>
                  <div className={[styles.navItem, styles.navItemActive].join(' ')}><span>📄 Quotes</span></div>
                  <div className={styles.navItem}><span>🔨 Jobs</span></div>
                  <div className={styles.navItem}><span>📊 Insights</span></div>
                </div>
              </div>

              <div className={styles.mainArea}>
                <div className={styles.topNav}>
                  <h1 className={styles.pageHeading}>Quote #Q-1048 &middot; Alex Morgan</h1>
                  <span className={styles.scoreBadge}>AI Draft Reviewed</span>
                </div>

                <div className={styles.scrollArea}>
                  <div className={styles.quoteGrid}>
                    <div className={styles.quoteCard}>
                      <h3 style={{ fontSize: 14, color: '#fff', marginBottom: 10 }}>Project Scope & Details</h3>
                      <div style={{ fontSize: 12, color: '#99a2b2', lineHeight: 1.6 }}>
                        <p><strong style={{ color: '#fff' }}>Customer:</strong> Alex Morgan</p>
                        <p><strong style={{ color: '#fff' }}>Location:</strong> 421 Elmhurst Ave, Royal Oak, MI</p>
                        <p><strong style={{ color: '#fff' }}>Service:</strong> 8 Recessed Pot Lights with Finished Ceiling Wire Fishing & Lutron Digital Dimmers.</p>
                      </div>
                    </div>

                    <div className={styles.quoteCard}>
                      <h3 style={{ fontSize: 14, color: '#fff', marginBottom: 12 }}>Itemized Line Items</h3>

                      <div className={styles.lineItemRow}>
                        <div>
                          <div className={styles.lineItemTitle}>1. 8x 4&quot; Slim LED Recessed Pot Lights (3000K)</div>
                          <div className={styles.lineItemDesc}>IC-rated airtight fixtures & precision laser ceiling layout</div>
                        </div>
                        <div className={styles.lineItemPrice}>$3,200.00</div>
                      </div>

                      <div className={styles.lineItemRow}>
                        <div>
                          <div className={styles.lineItemTitle}>2. Wire Fishing & Dedicated 15A Arc-Fault Circuit</div>
                          <div className={styles.lineItemDesc}>Specialized cable pull through finished 2nd floor joists</div>
                        </div>
                        <div className={styles.lineItemPrice}>$800.00</div>
                      </div>

                      <div className={styles.lineItemRow}>
                        <div>
                          <div className={styles.lineItemTitle}>3. Lutron Diva Smart Digital Dimmer Package</div>
                          <div className={styles.lineItemDesc}>Multi-location dimming switches with soft-fade memory</div>
                        </div>
                        <div className={styles.lineItemPrice}>$250.00</div>
                      </div>

                      <div className={styles.quoteTotalBox}>
                        <div className={styles.quoteTotalRow}>
                          <span>Final Total Quote:</span>
                          <span style={{ color: '#ff7a21' }}>$4,250.00</span>
                        </div>
                        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, color: '#99a2b2' }}>
                          <span>Required Deposit:</span>
                          <strong style={{ color: '#3dd68c', background: 'rgba(61,214,140,0.15)', padding: '3px 8px', borderRadius: 5 }}>
                            50% Deposit ($2,125.00)
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCENE 5: Send Quote */}
      {currentScene === 5 && (
        <div className={styles.sceneContainer}>
          <div className={styles.desktopWindow}>
            <div className={styles.windowHeader}>
              <div className={styles.windowDots}>
                <span className={[styles.windowDot, styles.dotRed].join(' ')} />
                <span className={[styles.windowDot, styles.dotYellow].join(' ')} />
                <span className={[styles.windowDot, styles.dotGreen].join(' ')} />
              </div>
              <div className={styles.windowTitle}>Quote #Q-1048 Delivery</div>
              <div className={styles.userPill}>Northline Electric</div>
            </div>

            <div className={styles.windowBody}>
              <div className={styles.sidebar}>
                <div className={styles.brandArea}>
                  <div className={styles.brandIcon}>Q</div>
                  <span className={styles.brandName}>Let’s Get Quoted</span>
                </div>
                <div className={styles.navList}>
                  <div className={styles.navItem}><span>📥 Leads</span></div>
                  <div className={[styles.navItem, styles.navItemActive].join(' ')}><span>📄 Quotes</span></div>
                  <div className={styles.navItem}><span>🔨 Jobs</span></div>
                  <div className={styles.navItem}><span>📊 Insights</span></div>
                </div>
              </div>

              <div className={styles.mainArea} style={{ alignItems: 'center', justifyContent: 'center' }}>
                <div className={styles.quoteCard} style={{ maxWidth: 540, width: '100%', textAlign: 'center', padding: 32 }}>
                  <div style={{ fontSize: 42, marginBottom: 10 }}>✉️</div>
                  <h2 style={{ fontSize: 22, color: '#fff', marginBottom: 6, fontFamily: 'Space Grotesk, sans-serif' }}>Quote Sent to Alex Morgan!</h2>
                  <p style={{ fontSize: 13, color: '#99a2b2', marginBottom: 18 }}>
                    Secure customer portal link delivered via SMS to <strong style={{ color: '#fff' }}>(248) 555-0199</strong> and email.
                  </p>
                  <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#ff7a21', wordBreak: 'break-all' }}>
                    🔗 https://northline.letsgetquoted.com/portal/q-1048
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCENE 6: Homeowner Portal & Payment */}
      {currentScene === 6 && (
        <div className={styles.sceneContainer}>
          <div className={styles.mobileSplitLayout}>
            <div className={styles.mobileFrame}>
              <div className={styles.mobileIsland} />
              <div className={styles.mobileStatus}><span>9:41</span><span>5G ▮▮▮</span></div>
              <div className={styles.mobileScreen}>
                <div className={styles.mobileContent}>
                  <div style={{ background: '#0f1624', borderRadius: 12, padding: 14, marginBottom: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#ff7a21', textTransform: 'uppercase' }}>Customer Portal</div>
                    <h3 style={{ fontSize: 15, color: '#fff', margin: '2px 0' }}>Northline Electric</h3>
                    <div style={{ fontSize: 11, color: '#99a2b2' }}>Quote #Q-1048 &middot; Alex Morgan</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginTop: 6, fontFamily: 'Space Grotesk, sans-serif' }}>$4,250.00</div>
                  </div>

                  <div style={{ background: 'rgba(20,27,40,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                    <h4 style={{ fontSize: 12, color: '#fff', marginBottom: 6 }}>Electronic Signature</h4>
                    <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: 8, fontFamily: 'Caveat, cursive', fontSize: 20, color: '#38bdf8' }}>
                      Alex Morgan ✓
                    </div>
                  </div>

                  <div style={{ background: 'rgba(20,27,40,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 12 }}>
                    <h4 style={{ fontSize: 12, color: '#fff', marginBottom: 6 }}>50% Required Deposit</h4>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#3dd68c', marginBottom: 8 }}>$2,125.00</div>
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px 10px', borderRadius: 6, marginBottom: 10, fontSize: 11.5, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Card on file</span>
                      <strong>•••• 4242</strong>
                    </div>
                    <button style={{ width: '100%', height: 38, background: '#27c93f', border: 'none', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 12 }}>
                      🎉 Payment Complete ($2,125.00 Paid)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.sideContext}>
              <span className={styles.sideEyebrow}>05 · APPROVE & PAY ONLINE</span>
              <h1 className={styles.sideTitle}>Approve, sign, and pay online.</h1>
              <p className={styles.sideDesc}>Homeowners review the itemized scope on any device, type their signature, and pay the required deposit in seconds via Stripe.</p>
              <div className={styles.sideBulletList}>
                <div className={styles.sideBullet}><span className={styles.sideBulletCheck}>✓</span> Legally binding digital e-signature</div>
                <div className={styles.sideBullet}><span className={styles.sideBulletCheck}>✓</span> 50% deposit collected automatically into your Stripe account</div>
                <div className={styles.sideBullet}><span className={styles.sideBulletCheck}>✓</span> Instant confirmation and arrival scheduling</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCENE 7: Jobs Board Execution */}
      {currentScene === 7 && (
        <div className={styles.sceneContainer}>
          <div className={styles.desktopWindow}>
            <div className={styles.windowHeader}>
              <div className={styles.windowDots}>
                <span className={[styles.windowDot, styles.dotRed].join(' ')} />
                <span className={[styles.windowDot, styles.dotYellow].join(' ')} />
                <span className={[styles.windowDot, styles.dotGreen].join(' ')} />
              </div>
              <div className={styles.windowTitle}>Jobs Workspace — Job #J-1048</div>
              <div className={styles.userPill}>Northline Electric</div>
            </div>

            <div className={styles.windowBody}>
              <div className={styles.sidebar}>
                <div className={styles.brandArea}>
                  <div className={styles.brandIcon}>Q</div>
                  <span className={styles.brandName}>Let’s Get Quoted</span>
                </div>
                <div className={styles.navList}>
                  <div className={styles.navItem}><span>📥 Leads</span></div>
                  <div className={styles.navItem}><span>📄 Quotes</span></div>
                  <div className={[styles.navItem, styles.navItemActive].join(' ')}><span>🔨 Jobs</span></div>
                  <div className={styles.navItem}><span>📊 Insights</span></div>
                </div>
              </div>

              <div className={styles.mainArea}>
                <div className={styles.topNav}>
                  <h1 className={styles.pageHeading}>Active Jobs</h1>
                  <span style={{ fontSize: 12, color: '#3dd68c' }}>Job #J-1048 marked completed on site</span>
                </div>

                <div className={styles.scrollArea}>
                  <div className={styles.cardTable}>
                    <div className={[styles.tableRow, styles.tableHeader].join(' ')}>
                      <span>Job ID</span>
                      <span>Customer & Scope</span>
                      <span>Deposit Status</span>
                      <span>Balance</span>
                      <span>Status</span>
                      <span>Action</span>
                    </div>

                    <div className={[styles.tableRow, styles.rowHighlighted].join(' ')}>
                      <div><strong style={{ color: '#fff' }}>#J-1048</strong></div>
                      <div>
                        <strong style={{ color: '#fff' }}>Alex Morgan</strong>
                        <div style={{ fontSize: 11, color: '#99a2b2' }}>8 Recessed Kitchen Pot Lights</div>
                      </div>
                      <div>
                        <span style={{ color: '#3dd68c', fontWeight: 700 }}>✓ $2,125 Paid</span>
                      </div>
                      <div>
                        <strong style={{ color: '#fff' }}>$4,250 Total</strong>
                      </div>
                      <div>
                        <span className={styles.scoreBadge} style={{ background: 'rgba(61,214,140,0.2)', color: '#3dd68c' }}>
                          ✓ COMPLETED
                        </span>
                      </div>
                      <div>
                        <button style={{ background: '#27c93f', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: 6, fontWeight: 700, fontSize: 11.5 }}>
                          ✓ Completed
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCENE 8: Business Insights */}
      {currentScene === 8 && (
        <div className={styles.sceneContainer}>
          <div className={styles.desktopWindow}>
            <div className={styles.windowHeader}>
              <div className={styles.windowDots}>
                <span className={[styles.windowDot, styles.dotRed].join(' ')} />
                <span className={[styles.windowDot, styles.dotYellow].join(' ')} />
                <span className={[styles.windowDot, styles.dotGreen].join(' ')} />
              </div>
              <div className={styles.windowTitle}>Business Performance & Analytics</div>
              <div className={styles.userPill}>Northline Electric</div>
            </div>

            <div className={styles.windowBody}>
              <div className={styles.sidebar}>
                <div className={styles.brandArea}>
                  <div className={styles.brandIcon}>Q</div>
                  <span className={styles.brandName}>Let’s Get Quoted</span>
                </div>
                <div className={styles.navList}>
                  <div className={styles.navItem}><span>📥 Leads</span></div>
                  <div className={styles.navItem}><span>📄 Quotes</span></div>
                  <div className={styles.navItem}><span>🔨 Jobs</span></div>
                  <div className={[styles.navItem, styles.navItemActive].join(' ')}><span>📊 Insights</span></div>
                </div>
              </div>

              <div className={styles.mainArea}>
                <div className={styles.topNav}>
                  <h1 className={styles.pageHeading}>Business Performance</h1>
                  <span style={{ fontSize: 12, color: '#3dd68c' }}>Updated real-time with Job #J-1048</span>
                </div>

                <div className={styles.scrollArea}>
                  <div className={styles.kpiGrid}>
                    <div className={styles.kpiCard}>
                      <div className={styles.kpiLabel}>Gross Revenue</div>
                      <div className={styles.kpiValue}>$142,850</div>
                      <div className={styles.kpiDelta}>▲ +$4,250 this week</div>
                    </div>
                    <div className={styles.kpiCard}>
                      <div className={styles.kpiLabel}>Net Collected</div>
                      <div className={styles.kpiValue}>$138,400</div>
                      <div className={styles.kpiDelta}>100% on-time collection</div>
                    </div>
                    <div className={styles.kpiCard}>
                      <div className={styles.kpiLabel}>Jobs Completed</div>
                      <div className={styles.kpiValue}>38</div>
                      <div className={styles.kpiDelta}>▲ +1 completed today</div>
                    </div>
                    <div className={styles.kpiCard}>
                      <div className={styles.kpiLabel}>Quote Conversion</div>
                      <div className={styles.kpiValue}>84.2%</div>
                      <div className={styles.kpiDelta}>▲ +2.1% from AI intake</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCENE 9: Branded Outro */}
      {currentScene === 9 && (
        <div className={styles.sceneContainer}>
          <div className={styles.endCard}>
            <div className={styles.brandIcon} style={{ width: 52, height: 52, fontSize: 26, margin: '0 auto 16px', borderRadius: 14 }}>Q</div>
            <h1 style={{ fontSize: 32, fontWeight: 800, fontFamily: 'Space Grotesk, sans-serif', color: '#fff', marginBottom: 8 }}>
              Let’s Get Quoted
            </h1>
            <p style={{ fontSize: 15, color: '#99a2b2' }}>
              One connected system built for trade contractors.
            </p>

            <div className={styles.endPills}>
              <span className={styles.endPill}>Request</span>
              <span style={{ color: '#ff7a21' }}>→</span>
              <span className={styles.endPill}>Quote</span>
              <span style={{ color: '#ff7a21' }}>→</span>
              <span className={styles.endPill}>Payment</span>
              <span style={{ color: '#ff7a21' }}>→</span>
              <span className={styles.endPill}>Insight</span>
            </div>

            <div style={{ fontSize: 13, color: '#ff7a21', fontWeight: 700 }}>
              northline.letsgetquoted.com
            </div>
          </div>
        </div>
      )}

      {/* Bottom Caption Bar */}
      <div className={styles.captionBar}>
        <span className={styles.captionBadge}>
          {['HOMEOWNER', 'AI SCOPING', 'ESTIMATE', 'CONTRACTOR', 'QUOTE BUILDER', 'SEND QUOTE', 'PORTAL & PAYMENT', 'JOBS', 'INSIGHTS', 'SUMMARY'][currentScene]}
        </span>
        <span className={styles.captionText}>
          {[
            'A homeowner describes the work.',
            'AI asks only what changes the price.',
            'A preliminary range sets expectations.',
            'The request arrives organized and ready to quote.',
            'Review the draft. Set the final price.',
            'Send one secure link.',
            'Approve, sign, and pay online.',
            'The approved quote became a job.',
            'Every completed job updates the business picture.',
            'Request → Quote → Payment → Insight.'
          ][currentScene]}
        </span>
      </div>
    </div>
  );
}
