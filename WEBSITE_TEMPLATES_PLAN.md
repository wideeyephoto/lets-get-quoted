# Website Templates Feature Plan

## Overview

Contractors can create and customize a public website for their business that:
- Shows portfolio/services
- Displays testimonials/reviews (from jobs)
- Has a CTA for homeowners to request quotes
- Can use a subdomain (e.g., `contractor-name.letsgetquoted.com`) or custom domain
- Is fully customizable (brand colors, fonts, images, content)

---

## Phase 1: Foundation (MVP)

### Database Schema ✅
Already exists in `schema.sql`:
- `sites` table with template, customization fields, content storage
- RLS policies for account isolation

### Backend: Site Management (`src/lib/sites.ts`)

**Functions needed**:
```typescript
// Get site for account (or create default)
getSiteForAccount(supabase, accountId) → Site | null

// Create site with defaults
createSite(supabase, accountId, data) → Site

// Update site content
updateSite(supabase, accountId, siteId, updates) → Site

// Get public site by subdomain (no auth)
getPublicSiteBySubdomain(subdomain) → Site | null

// Publish/unpublish site
publishSite(supabase, accountId, siteId, published) → void
```

### Frontend: Site Editor

**Route**: `/dashboard/sites`

**UI Components**:
1. **Site List** - Show account's site (usually just 1)
2. **Site Editor Form**:
   - Template selector (dropdown: "Carbon", "Professional", "Modern", etc.)
   - Business info inputs:
     - Company name
     - Headline / tagline
     - Phone, license, hours, service area
   - Customization:
     - Accent color (hex picker)
     - Header font (dropdown)
     - Button style (dropdown)
     - Portal mode (light/dark toggle)
   - Images:
     - Logo URL
     - Hero image URL
   - Publishing:
     - Subdomain input (live availability check)
     - Custom domain input (for enterprise)
     - Publish/unpublish toggle
   - Preview button (opens new tab to public site)

### Frontend: Public Site Renderer

**Route**: `/{subdomain}` and `/:customDomain`

**Renders**:
- Template-based layout (e.g., "carbon" template)
- Shows contractor's business info
- CTA: "Request a Quote" → links to quote form (could be separate feature)
- Simple, responsive design

**Styling**:
- Template-specific CSS
- Contractor's accent color applied to buttons/links
- Logo and hero images displayed
- Portal mode (light/dark) applied

---

## Phase 1 Files to Create

```
src/lib/sites.ts                          → Site CRUD + RLS checks
src/app/dashboard/sites/page.tsx          → Site editor UI
src/app/dashboard/sites/actions.ts        → Server actions for site updates
src/app/dashboard/sites/SiteEditor.tsx    → Form component
src/app/dashboard/sites/PreviewButton.tsx → Opens preview in new tab
src/app/(public)/[subdomain]/page.tsx     → Public site renderer
src/lib/templates/                        → Template system
  ├─ types.ts                             → Template types
  ├─ carbon.tsx                           → Carbon template (default)
  └─ index.ts                             → Template registry
```

---

## Implementation Order

1. **`src/lib/sites.ts`** - Basic CRUD
2. **`src/lib/templates/`** - Template system + Carbon template
3. **`src/app/(public)/[subdomain]/page.tsx`** - Public site renderer
4. **`src/app/dashboard/sites/`** - Site editor UI
5. **Link from dashboard** - Add "Sites" to main nav

---

## Template System

**Carbon Template** (MVP):
- Clean, professional design
- Hero section (image + headline)
- Company info section
- Services/portfolio section (fetched from jobs? or hardcoded for now?)
- CTA button
- Footer with contact info

**Future Templates**:
- Professional (corporate look)
- Modern (trendy design)
- Portfolio (showcase-focused)
- Minimal (simple, fast)

---

## Roadmap (Phase 2+)

- [ ] Portfolio section (auto-pull from completed jobs)
- [ ] Testimonials section (auto-pull from job reviews)
- [ ] Gallery upload
- [ ] Email capture form
- [ ] Custom domain setup wizard
- [ ] SEO settings (meta tags, structured data)
- [ ] Analytics integration
- [ ] Multiple language support

---

## Start Date
Ready when you give the go-ahead!
