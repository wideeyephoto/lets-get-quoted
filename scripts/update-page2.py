import re

with open('src/app/portal/view/[token]/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

target = """<span className="payment-amount-label">
                    Balance due{openInvoices.length > 1 ? ` · ${openInvoices.length} invoices` : ''}
                  </span>
                  <strong className="payment-amount" style={{ fontSize: '1.25rem' }}>{formatMoney(portal.outstanding)}</strong>
                </div>
              ) : null}"""

replacement = """<span className="payment-amount-label">
                    Balance due{openInvoices.length > 1 ? ` · ${openInvoices.length} invoices` : ''}
                  </span>
                  <strong className="payment-amount" style={{ fontSize: '1.25rem' }}>{formatMoney(portal.outstanding)}</strong>
                  {openInvoices.length > 1 && (
                    <form action={async () => {
                      'use server';
                      const { payPortalOutstandingAction } = await import('./actions');
                      await payPortalOutstandingAction(params.token);
                    }}>
                      <button type="submit" style={{ marginTop: '0.5rem', background: 'var(--ink-link, #2563eb)', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Pay All Open Invoices</button>
                    </form>
                  )}
                </div>
              ) : null}"""

if target in text:
    text = text.replace(target, replacement)
    with open('src/app/portal/view/[token]/page.tsx', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Replaced!")
else:
    print('Target not found!')
