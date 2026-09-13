import re

with open('src/lib/client-portal-data.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the regex error
content = content.replace("url: /client/jobs/#change-orders,", "url: `/client/jobs/${row.job_id}#change-orders`,")
content = content.replace("url: /client/jobs/#selections,", "url: `/client/jobs/${row.job_id}#selections`,")
content = content.replace("url: /client/jobs/#forms,", "url: `/client/jobs/${row.job_id}#forms`,")

# Fix the newline error at the end
content = content.replace("outstanding: Math.round(invoices.reduce((sum, invoice) => sum + invoice.due, 0) * 100) / 100,\\n    actionQueue,", "outstanding: Math.round(invoices.reduce((sum, invoice) => sum + invoice.due, 0) * 100) / 100,\n    actionQueue,")

with open('src/lib/client-portal-data.ts', 'w', encoding='utf-8') as f:
    f.write(content)
