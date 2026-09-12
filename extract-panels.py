import os
import re

file_path = 'src/app/admin/accounts/[id]/page.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

panels = {}
current_panel = None
bracket_level = 0
paren_level = 0
panel_lines = []

inside_string = False
string_char = None
escape_next = False

def count_brackets(line):
    global bracket_level, paren_level, inside_string, string_char, escape_next
    for char in line:
        if escape_next:
            escape_next = False
            continue
        if char == '\\':
            escape_next = True
            continue
        
        if not inside_string:
            if char in ("'", '"', '`'):
                inside_string = True
                string_char = char
            elif char == '{':
                bracket_level += 1
            elif char == '}':
                bracket_level -= 1
            elif char == '(':
                paren_level += 1
            elif char == ')':
                paren_level -= 1
        else:
            if char == string_char:
                inside_string = False

i = 0
while i < len(lines):
    line = lines[i]
    
    if current_panel is None:
        match = re.match(r'^  const (render[A-Za-z]+Panel) = \(\) => (\(|{)', line)
        if match:
            current_panel = match.group(1)
            panel_lines = [line]
            bracket_level = 0
            paren_level = 0
            inside_string = False
            string_char = None
            escape_next = False
            count_brackets(match.group(2)) # Count the opening bracket/paren
    else:
        panel_lines.append(line)
        count_brackets(line)
        if bracket_level == 0 and paren_level == 0:
            panels[current_panel] = "".join(panel_lines)
            current_panel = None
            
    i += 1

print(f"Found {len(panels)} panels:")
for p in panels.keys():
    print(f"- {p}")

if len(panels) != 17:
    print("Warning: Did not find exactly 17 panels")

# Now let's remove them from page.tsx and generate panels.tsx
# In page.tsx, we replace the panel definitions with nothing.
new_page_content = "".join(lines)
for p, content in panels.items():
    new_page_content = new_page_content.replace(content, "")

# We need to create panels.tsx. We will dump all panels as exported functions.
panels_tsx = """import Link from 'next/link';
import { formatTimestamp, formatNumber, formatUsd, capFirst } from '@/app/admin/utils/formatters';
import styles from '../../admin.module.css';
import { 
  getFlagAction, 
  releaseAction, 
  issueCreditAction, 
  disconnectAction,
  requireReverificationAction,
  resendOnboardingAction,
  signOutAction,
  suspendAction,
  unsuspendAction,
  restrictPayoutsAction,
  unrestrictPayoutsAction,
  addNoteAction,
  removeTagAction,
  addTagAction,
  deleteAttachmentAction,
  uploadAttachmentAction,
  markSyntheticAction,
  markProductionAction,
  setLegalHoldAction,
  liftLegalHoldAction,
  submitClosureRequestAction,
} from './actions';
import AccountActions from './AccountActions';
import { connectDashboardUrl } from '@/lib/admin-accounts';
import { PaymentStatusPill, bool, words, fmtDateTime, fmtDate, usdCents, initials } from './utils';

export interface AccountPanelProps {
  a: any;
  detail: any;
  displayName: string;
  canFlag: boolean;
  actions: any[];
  cases: any[];
  messages: any[];
  usageOverage: any;
  irreversibleWork: any;
  apiSurface: any;
  googleLsa: any;
  attachmentLinks: any[];
  suspended: boolean;
  legalHold: boolean;
  lockedUntil: string | null;
  paypaused: boolean;
  connected: boolean;
  payoutsRestricted: boolean;
  entitlement: any;
  subscription: any;
  now: Date;
  ctx: any;
  admin: any;
  isSynthetic: boolean;
}

"""

for p, content in panels.items():
    # Convert 'const renderFooPanel = () => (' to 'export function FooPanel(props: AccountPanelProps) { const { ... } = props; return ('
    panel_name = p.replace("render", "")
    
    # Extract the body
    body = content
    body = re.sub(r'^  const ' + p + r' = \(\) => ', '', body)
    
    func_code = f"export function {panel_name}(props: AccountPanelProps) {{\n"
    func_code += "  const { a, detail, displayName, canFlag, actions, cases, messages, usageOverage, irreversibleWork, apiSurface, googleLsa, attachmentLinks, suspended, legalHold, lockedUntil, paypaused, connected, payoutsRestricted, entitlement, subscription, now, ctx, admin, isSynthetic } = props;\n"
    if body.startswith("{"):
        # It's an arrow function with a block body
        func_code += body[1:-1] # remove { and }
    else:
        # It's an arrow function with paren body
        func_code += f"  return {body};\n"
    
    func_code += "}\n\n"
    panels_tsx += func_code

with open('src/app/admin/accounts/[id]/panels.tsx', 'w', encoding='utf-8') as f:
    f.write(panels_tsx)

# Replace the calls in page.tsx
for p in panels.keys():
    panel_name = p.replace("render", "")
    new_page_content = new_page_content.replace(f"{{{p}()}}", f"<{panel_name} {{...panelProps}} />")

# Add the import and panelProps to page.tsx
import_panels = "import {\n" + ",\n".join(["  " + p.replace("render", "") for p in panels.keys()]) + "\n} from './panels';\n"
new_page_content = new_page_content.replace("import AccountDetailView", import_panels + "import AccountDetailView")

# Insert panelProps declaration before the AccountDetailView
panel_props_decl = """
  const panelProps = {
    a, detail, displayName, canFlag, actions, cases, messages, usageOverage, irreversibleWork, apiSurface, googleLsa, attachmentLinks, suspended, legalHold, lockedUntil, paypaused, connected, payoutsRestricted, entitlement, subscription, now, ctx, admin, isSynthetic
  };
"""
new_page_content = new_page_content.replace("<AccountDetailView", panel_props_decl + "  <AccountDetailView")

with open('src/app/admin/accounts/[id]/page.tsx', 'w', encoding='utf-8') as f:
    f.write(new_page_content)

print("Extraction complete!")
