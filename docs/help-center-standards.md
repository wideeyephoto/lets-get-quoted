# Help Center Standards

## Article Template

```mdx
---
title: "Article Title"
owner: "Team / Person"
last_verified: "YYYY-MM-DD"
category: "Category Name"
---

# Purpose
Briefly explain what the user will accomplish in this article.

# Steps
1. First step.
2. Second step.

# Done State
How the user knows they succeeded (e.g., "You'll see a green checkmark").

# Common Failure
What to check if it didn't work (e.g., "If it fails, check your settings").
```

## Style Guide

- **Mobile-first**: Assume the user is reading on their phone while on a job site.
- **Short steps**: Keep steps under 2 sentences. Use numbered lists.
- **No wide tables**: Tables break mobile layouts. Use lists or definition lists instead.
- **Contractor voice**: Explain the product, not the trade. Talk to them as business owners.

## Screenshot Policy

- Avoid screenshots for simple UI elements. 
- Use Playwright to automatically generate screenshots against a seeded demo account for complex workflows, so they stay up-to-date.
