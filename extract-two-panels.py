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
        match = re.match(r'^  const (renderAuditPanel|renderUsageAndOveragePanel) = \(\) => (\(|{)', line)
        if match:
            current_panel = match.group(1)
            panel_lines = [line]
            bracket_level = 0
            paren_level = 0
            inside_string = False
            string_char = None
            escape_next = False
            count_brackets(match.group(2))
    else:
        panel_lines.append(line)
        count_brackets(line)
        if bracket_level == 0 and paren_level == 0:
            # Fix the };} issue if it happened
            if panel_lines[-1].strip() == '};}':
                panel_lines[-1] = panel_lines[-1].replace('};}', '}')
            if panel_lines[-1].strip() == '};':
                panel_lines[-1] = panel_lines[-1].replace('};', '}')
            panels[current_panel] = "".join(panel_lines)
            current_panel = None
    i += 1

panels_tsx = """import Link from 'next/link';
import { formatTimestamp, formatNumber, formatUsd, capFirst } from '@/app/admin/utils/formatters';
import styles from '../../admin.module.css';
import { PaymentStatusPill, bool, words, fmtDateTime, fmtDate, usdCents, initials } from './utils';

// Imports needed by UsageAndOverage
import { formatPlatformFeeBps, remainingCapMillicents, describeOverageResource, formatOverageRate, formatOverageTotal, formatStorageBytes } from '@/lib/admin-overage';

export interface ExtraPanelsProps {
  accountId: string;
  actions: any[];
  page: number;
  usageOverage: any;
  entitlement: any;
}

"""

for p, content in panels.items():
    panel_name = p.replace("render", "")
    body = content
    body = re.sub(r'^  const ' + p + r' = \(\) => ', '', body)
    
    # Fix usages of `params.id` to `props.accountId`
    body = body.replace('params.id', 'props.accountId')
    
    func_code = f"export function {panel_name}(props: ExtraPanelsProps) {{\n"
    func_code += "  const { accountId, actions, page, usageOverage, entitlement } = props;\n"
    if body.startswith("{"):
        func_code += body[1:-1]
    else:
        func_code += f"  return {body};\n"
    if not func_code.endswith("\n}\n\n"):
        func_code = func_code.rstrip(';\n \t')
        if func_code.endswith('}'):
            func_code = func_code[:-1] + "\n}\n\n"
        else:
            func_code += "\n}\n\n"
    
    panels_tsx += func_code

with open('src/app/admin/accounts/[id]/extra-panels.tsx', 'w', encoding='utf-8') as f:
    f.write(panels_tsx)

new_page_content = "".join(lines)
for p, content in panels.items():
    new_page_content = new_page_content.replace(content, "")

for p in panels.keys():
    panel_name = p.replace("render", "")
    new_page_content = new_page_content.replace(f"{{{p}()}}", f"<{panel_name} {{...extraProps}} />")

import_stmt = f"import {{ {', '.join([p.replace('render', '') for p in panels.keys()])} }} from './extra-panels';\n"
new_page_content = new_page_content.replace("import AccountDetailView", import_stmt + "import AccountDetailView")

props_decl = """
  const extraProps = {
    accountId: params.id,
    actions,
    page: parseInt(searchParams?.page || '1', 10) || 1,
    usageOverage,
    entitlement,
  };
"""
new_page_content = new_page_content.replace("<AccountDetailView", props_decl + "  <AccountDetailView")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_page_content)

print("Done extracting two panels")
