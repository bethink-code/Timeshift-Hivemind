---
name: molo-ui-design
description: >
  Molo visual design specification for building web applications, dashboards,
  internal tools, and client-facing pages in Claude Code. Use whenever building
  any UI for Molo — React, plain HTML, dashboards, portals, landing pages, or
  any web interface. Contains all brand tokens, typography, component patterns,
  and messaging rules needed to produce on-brand output regardless of tech stack.
  Trigger on: "build an app", "create a dashboard", "build a tool", "make a page",
  "create a UI", or any request to produce a web interface in a Molo context.
---

# Molo UI Design Specification
*Version 1.0 — March 2026*

This is the visual specification for all Molo web interfaces. It defines what things look like — colours, type, spacing, components — not how to implement them. Apply it regardless of tech stack.

---

## COLOUR SYSTEM

### Light mode (default — all apps, tools, dashboards, client pages)

| Role | Hex | Where |
|------|-----|-------|
| Page background | `#FFFFFF` | Always white |
| Surface / highlight | `#F3F3F5` | Featured cards, table rows, input backgrounds |
| Teal | `#016C77` | Headings, buttons, links, borders, icons |
| Orange | `#CF6B1B` | Eyebrows, meta lines, pricing, human-element callouts |
| Primary text | `#111827` | Page titles, key values |
| Body text | `#555555` | Descriptions, content, labels |
| Muted text | `#6B7280` | Secondary info, placeholders |
| Dim text | `#9CA3AF` | Timestamps, fine print |
| Subtle border | `#E5E7EB` | Card borders, dividers, input outlines |
| Dim border | `#D1D5DB` | Secondary separators |

**Critical rules:**
- `#016C77` is the only teal used in light mode. Never `#1CBAC8` on white or light backgrounds.
- `#1CBAC8` appears **only** as accent text inside teal-panel components (see below).
- Teal = AI / technology elements. Orange = human / meta / pricing elements.
- Never use orange as a primary action colour — it is always a label or callout.

### Dark mode (hero sections, splash pages, marketing)

| Role | Hex |
|------|-----|
| Background | `#050505` |
| Card surface | `#0A0A0A` |
| Teal (headings, CTAs) | `#1CBAC8` |
| Orange | `#CF6B1B` |
| Primary text | `#FFFFFF` |
| Secondary text | `#9CA3AF` |
| Card border | `rgba(255,255,255,0.08)` |

---

## TYPOGRAPHY

Font: **Inter** throughout. No other typeface.

### Seven-level hierarchy — apply strictly

| Level | Element | Size | Weight | Colour | Notes |
|-------|---------|------|--------|--------|-------|
| Eyebrow | Category label | 11px | 700 | `#CF6B1B` | Uppercase, tracked. 4px below, tight to title. |
| Page title | Primary heading | 44px | 900 | `#111827` | One per page. Dominates everything. |
| Section title | Card / section heading | 28px | 800 | `#016C77` | Clear step below page title. |
| Subsection | Decision / gate label | 16px | 700 | `#111827` | Gate labels, outcome labels. |
| Meta | Pricing, timing, mode | 14px | 500 | `#CF6B1B` | Always orange. |
| Body | Descriptions, content | 14px | 400 | `#555555` | 125% line height. |
| Detail | Facts, supporting info | 14px | 400 | `#555555` | Same size as body — facts matter. |

**Rules:**
- 14px is the minimum for any readable content. Nothing below it.
- No two adjacent elements should look the same visual weight.
- The gap between levels creates hierarchy — don't compress it to look "balanced."
- Eyebrow sits 4px above the title it introduces — tight, not a section break.
- If an element doesn't fit a level, it probably shouldn't exist.

---

## COMPONENT PATTERNS

### Cards — three styles, no others

**Default** — white background, left border accent only (1.5px, `#E5E7EB`), rounded corners (8px). No top, right, or bottom border. Left padding 20px.

**Highlighted** — `#F3F3F5` background, no border, rounded corners (8px). Maximum one per section. Used to draw attention without hierarchy noise.

**Teal panel** — full `#016C77` background, rounded corners (16px), generous padding. Used for CTAs, closing sections, key callouts. See Teal Panel section below.

**Rules:**
- All cards have rounded corners. No exceptions.
- Left border accents are straight vertical lines — no border-radius on the left border itself.
- Never highlight the same element twice (e.g. a highlighted card with a badge on top of it).

### Buttons

**Primary:** `#016C77` background, white text, rounded (8px).
**Secondary:** White background, `#016C77` border and text, rounded (8px).
**Destructive:** `#B91C1C` background, white text.

No gradients. No heavy shadows. Flat with border-radius.

### Form inputs

Border `#E5E7EB`, rounded (8px). Focus: `#016C77` ring. Placeholder: `#6B7280`. Label: 14px, `#111827`, weight 500.

### Navigation

Background white or `#F3F3F5`. Active item: `#016C77` text, very light teal tint background. 14px, weight 500.

### Status badges / pills

Rounded-full. Small text, weight 600.
- Active / success: `#016C77` text, `rgba(1,108,119,0.1)` background
- Warning / pending: `#CF6B1B` text, `rgba(207,107,27,0.1)` background
- Error: `#B91C1C` text, `rgba(185,28,28,0.1)` background
- Neutral: `#6B7280` text, `#F3F3F5` background

### Data tables

Header: `#F3F3F5` background, 12px uppercase labels, `#6B7280`, weight 600. Row dividers: `#E5E7EB`. Hover row: `#F9FAFB`. Primary cell values: `#111827`. Secondary: `#555555`.

### Icons

Line icons only. Stroke weight 1.5–2px. Teal for actions and navigation, orange for warnings and meta, muted grey for decorative.

### Arrows

Chevron `>` style only. Never filled triangles. Colour: `#016C77` in light mode, `#FFFFFF` on teal panels.

---

## TEAL PANEL

Used for: CTAs, closing sections, key callouts. Distinct rules apply inside.

Background: `#016C77`. Rounded corners: 16px. Generous internal padding.

**Typography inside a teal panel:**

| Element | Size | Weight | Colour |
|---------|------|--------|--------|
| Eyebrow | 13px | 400 | `#000000` |
| Headline | 48px | 900 | `rgba(254,254,254,0.6)` |
| Headline — highlight word | 48px | 900 | `#FFFFFF` |
| Body | 14px | 400 | `#000000` |

Sub-cards inside a teal panel use a left-border-only style with `rgba(255,255,255,0.4)` border. Sub-card detail lines: `#1CBAC8`. This is the **only** place light teal appears in the entire system.

---

## SPACING

Generous spacing is not wasted space — it is what makes the interface readable.

| Context | Value |
|---------|-------|
| Between major sections | 48–64px |
| Card internal padding | 20–24px |
| Icon + label gap | 8px |
| Label + value stack | 4px |
| Page horizontal padding | 24–48px |

When a layout feels cramped: add space and reduce content — not the other way around.

---

## BULLET / DOT SYSTEM

**Eye dot** — 10px filled circle. Key facts, hard commitments, critical items. Teal `#016C77` or orange `#CF6B1B`.

**Standard dot** — 7px filled circle. Standard list items, supporting context.

**Dim dot** — 7px filled circle, `#D1D5DB`. Fine print, secondary items.

All dots are filled circles only. No outlines, rings, or hollow variants.

---

## MESSAGING RULES

Apply to all copy inside any Molo-built interface:

- **"AI Agents"** — never "chatbots"
- **"Proof of Value"** — never "sandbox" or "proof of concept"
- **"Value Path"** — the four-stage engagement model
- **"Smart assistants for your staff that you can share with clients"** — locked hero line
- Use: scale, extend, empower — **never**: replace, automate away, reduce headcount
- Front-office: Molo requires no back-office or core-system integration — state this early
- "Unlocking AI in your business" — framing concept, not a tagline

---

## QUALITY CHECK

Before delivering any UI:

- [ ] Inter font loaded
- [ ] `#016C77` for all teal in light mode — not `#1CBAC8`
- [ ] `#1CBAC8` only inside teal panel detail lines
- [ ] `#CF6B1B` for all eyebrows and meta lines
- [ ] 14px minimum for all readable content
- [ ] No two adjacent elements the same visual weight
- [ ] All cards have rounded corners
- [ ] Left border accents are straight vertical lines
- [ ] Maximum one highlighted card per section
- [ ] Spacing is generous — if tight, add more
- [ ] No "chatbot", no replacement language

---

## VERSION

**Version:** 1.0 — March 2026
**Owner:** Garth Shoebridge
