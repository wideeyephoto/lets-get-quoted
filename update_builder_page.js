const fs = require('fs');
const path = 'src/app/dashboard/sites/tabs/BuilderPageTab.tsx';
let content = fs.readFileSync(path, 'utf8');

// The block ends with `                                  </div>\n                                  <div className={styles.jobPhotoImport}>`
// Let's replace that exact string.

const anchor = `                                  </div>
                                  <div className={styles.jobPhotoImport}>`;

const replacement = `                                  </div>

                                  <div className={styles.formField}>
                                    <label htmlFor="elfsightWidgetId">
                                      Elfsight Google Reviews Widget ID <span style={{ fontWeight: 'normal', color: 'var(--text-secondary)' }}>(for SEO markup)</span>
                                    </label>
                                    <input
                                      id="elfsightWidgetId"
                                      type="text"
                                      placeholder="e.g. 12345abc-1234-1234-1234-123456abcdef"
                                      value={siteContent.testimonials.elfsightWidgetId || ''}
                                      onChange={(e) => updateTestimonials({ ...siteContent.testimonials, elfsightWidgetId: e.target.value })}
                                    />
                                    <p className={styles.fieldHint} style={{ marginTop: '0.25rem', fontSize: '0.875rem' }}>
                                      Optional. Create a free Google Reviews widget at elfsight.com. Elfsight automatically publishes the required review markup that Google expects for a LocalBusiness.
                                    </p>
                                  </div>
                                  <div className={styles.jobPhotoImport}>`;

// Handle \r\n explicitly!
let anchorRegex = /                                  <\/div>\r?\n                                  <div className=\{styles\.jobPhotoImport\}>/;

content = content.replace(anchorRegex, replacement);

fs.writeFileSync(path, content);
console.log("REPLACED");
