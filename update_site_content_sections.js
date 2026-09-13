const fs = require('fs');
const path = 'src/lib/templates/SiteContentSections.tsx';
let content = fs.readFileSync(path, 'utf8');

// Insert the Elfsight script + div
const replacement = \          {testimonials.elfsightWidgetId ? (
            <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'center' }}>
              <script src="https://static.elfsight.com/platform/platform.js" async></script>
              <div className={\\\elfsight-app-\\\\}></div>
            </div>
          ) : testimonials.googleReviews.length > 0 && (
            <p className={styles.googleAttribution} data-reveal>
              {testimonials.googleRating > 0 && <strong>{testimonials.googleRating.toFixed(1)} ? on Google{testimonials.googleReviewCount > 0 ? \\\ · \ reviews\\\ : ''}</strong>}
              {testimonials.googleUrl && <a href={testimonials.googleUrl} target="_blank" rel="noopener noreferrer nofollow">See all reviews on Google ?</a>}
              <span className={styles.googlePoweredBy}>Powered by Google</span>
            </p>
          )}\;

// the original has ? but powershell might have messed it up if there's no utf-8 encoding.
// It's safer to just replace from {testimonials.googleReviews.length > 0 && ( to )}

content = content.replace(/\{testimonials\.googleReviews\.length > 0 && \([\s\S]*?\)\s*\}/, replacement);

fs.writeFileSync(path, content);
