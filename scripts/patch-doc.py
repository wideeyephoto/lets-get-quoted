import re

with open('src/app/portal/view/[token]/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('import { ReferralButtons } from \'./ReferralButtons\';', 'import { ReferralButtons } from \'./ReferralButtons\';\nimport { DocumentLink } from \'./DocumentLink\';')

pattern = re.compile(r'<a\s+href=\{doc\.url\}\s+target=\{doc\.url\.startsWith[^>]*>\s*(.*?)\s*</a>', re.DOTALL)

replacement = '<DocumentLink url={doc.url} documentId={doc.id}>{doc.url.endsWith(\'.pdf\') ? \'Download PDF\' : \'View \' + \'\\u2192\'}</DocumentLink>'

# Wait, let's just do a simple replace since we know the content
old_link = '''<a
                        href={doc.url}
                        target={doc.url.startsWith('http') ? '_blank' : undefined}
                        rel="noopener noreferrer"
                        style={{ color: 'var(--ink-link, #2563eb)', fontWeight: 500, textDecoration: 'none' }}
                      >
                        {doc.url.endsWith('.pdf') ? 'Download PDF' : 'View \\u2192'}
                      </a>'''

new_link = '''<DocumentLink url={doc.url} documentId={doc.id}>
                        {doc.url.endsWith('.pdf') ? 'Download PDF' : 'View \\u2192'}
                      </DocumentLink>'''

text = text.replace(old_link, new_link)

with open('src/app/portal/view/[token]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
