import re

with open('src/app/portal/view/[token]/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("import { customerTogglePlanAction } from './actions';", "import { customerTogglePlanAction } from './actions';\nimport PortalPlanScheduleOptions from './PortalPlanScheduleOptions';")

target_html = """<div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem', fontSize: '0.82rem', color: 'var(--mute-t50, #64748b)' }}>
                    {plan.nextRunDate ? <span>📅 Next service: <strong>{formatDay(plan.nextRunDate)}</strong></span> : null}
                    {plan.paymentMethodSummary ? <span>💳 Auto-pay: <strong>{plan.paymentMethodSummary}</strong></span> : plan.autoCharge ? <span>💳 Auto-charge enabled</span> : null}
                    {plan.remainingCycles !== null ? <span>🔄 {plan.remainingCycles} visits remaining</span> : null}
                    {plan.totalCycles ? <span>🔢 {plan.totalCycles} total installments</span> : null}
                  </div>"""

replacement_html = """<div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.5rem', fontSize: '0.82rem', color: 'var(--mute-t50, #64748b)' }}>
                    {plan.paymentMethodSummary ? <span>💳 Auto-pay: <strong>{plan.paymentMethodSummary}</strong></span> : plan.autoCharge ? <span>💳 Auto-charge enabled</span> : null}
                    {plan.remainingCycles !== null ? <span>🔄 {plan.remainingCycles} visits remaining</span> : null}
                    {plan.totalCycles ? <span>🔢 {plan.totalCycles} total installments</span> : null}
                  </div>
                  <PortalPlanScheduleOptions plan={plan} token={params.token} businessName={portal.businessName} />"""

if target_html in text:
    text = text.replace(target_html, replacement_html)
    with open('src/app/portal/view/[token]/page.tsx', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Replaced!")
else:
    print('Target HTML not found!')
