import re

with open('src/app/portal/view/[token]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """          </p>

          {/* Needs Action Queue */}
          {portal.actionQueue && portal.actionQueue.length > 0 && (
            <div className="portal-action-queue" style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
              <div style={{ background: 'var(--ink-amber-1)', border: '1px solid var(--ink-amber-3)', borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span aria-hidden="true">⚠️</span>
                  <span>Needs your attention</span>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {portal.actionQueue.map((action) => (
                    <Link
                      key={action.id}
                      href={action.url}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.75rem',
                        background: 'white',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        color: 'var(--ink-base)',
                        border: '1px solid var(--ink-amber-2)',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      }}
                    >
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.95rem' }}>
                          {action.kind === 'change_order' && 'Change Order: '}
                          {action.kind === 'selection' && 'Selection: '}
                          {action.kind === 'form' && 'Form: '}
                          {action.title}
                        </strong>
                        <span style={{ fontSize: '0.85rem', color: 'var(--ink-subtle)' }}>
                          For {action.jobRef}
                        </span>
                      </div>
                      <span style={{ color: '#d97706', fontWeight: 600, fontSize: '0.9rem' }}>Review &rarr;</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Quick Metrics Bar */}"""

content = content.replace("          </p>\n\n          {/* Quick Metrics Bar */}", replacement)

with open('src/app/portal/view/[token]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Patch applied')
