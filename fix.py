import os

files = {
    'src/app/dashboard/jobs/[id]/lien-help/actions.ts': [
        (r"revalidatePath(\/dashboard/jobs/\/lien-help\);", r"revalidatePath(/dashboard/jobs//lien-help);")
    ],
    'src/app/dashboard/jobs/[id]/lien-help/page.tsx': [
        (r"<Link href={\/dashboard/jobs/\} className=\"text-blue-600 hover:underline\">", r"<Link href={/dashboard/jobs/} className=\"text-blue-600 hover:underline\">")
    ],
    'src/lib/lien-help-packet.ts': [
        (r"return { zip_path: \//packet-v1.zip\, hash: 'placeholder', size: 0 };", r"return { zip_path: ${accountId}//packet-v1.zip, hash: 'placeholder', size: 0 };")
    ],
    'src/lib/lien-help-storage.ts': [
        (r"const path = \//-\;", r"const path = ${accountId}//-;")
    ]
}

for path, replacements in files.items():
    if not os.path.exists(path):
        continue
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    for search, replace in replacements:
        content = content.replace(search, replace)
        
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

print("done")
