import re

with open('src/app/portal/view/[token]/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('import { PortalTracker } from \'./PortalTracker\';', 'import { PortalTracker } from \'./PortalTracker\';\nimport { ReferralButtons } from \'./ReferralButtons\';\nimport { InViewTracker } from \'./InViewTracker\';')

# Replace Referral buttons
pattern = re.compile(r'<div className="actions workspace-actions"[^>]*>.*?</div>\s*</section>', re.DOTALL)

replacement = '<ReferralButtons shareText={shareText} businessName={portal.businessName} />\n        </section>'
text = pattern.sub(replacement, text)

# Add InViewTrackers
text = text.replace('<p className="eyebrow">Document & Media Vault</p>', '<InViewTracker payload={{ step: \'portal_section_viewed\', sectionName: \'vault\' }} />\n                <p className="eyebrow">Document & Media Vault</p>')

text = text.replace('<p className="eyebrow">Communication Center</p>', '<InViewTracker payload={{ step: \'portal_section_viewed\', sectionName: \'messages\' }} />\n              <p className="eyebrow">Communication Center</p>')

text = text.replace('<p className="eyebrow">Work history</p>', '<InViewTracker payload={{ step: \'portal_section_viewed\', sectionName: \'work_history\' }} />\n              <p className="eyebrow">Work history</p>')

text = text.replace('<p className="eyebrow">Durable Home Passport</p>', '<InViewTracker payload={{ step: \'portal_section_viewed\', sectionName: \'passport\' }} />\n                <p className="eyebrow">Durable Home Passport</p>')

with open('src/app/portal/view/[token]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
