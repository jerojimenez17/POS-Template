# Change: ui-enhancements

**Source:** F1 (docs/enhancements/04-incoming-features.md)  
**Phase:** 7 — New Features  
**Effort:** ~5 days  
**Risk:** Medium  

## Problem

No consistent design system or brand identity:
- Raw Tailwind utility classes spread across components
- No CSS custom properties for design tokens
- No consistent color palette beyond Tailwind defaults
- ThemeToggle only supports light/dark — no brand customization

## Scope

`src/app/globals.css`, `src/components/ui/`, layouts, theme system.

## Solution

1. **Design Tokens**: Define CSS custom properties in `globals.css` (colors, spacing, radii, fonts)
2. **Component Variants**: Use CVA (already in dependencies) for consistent Button, Card, Input variants
3. **Minimalist Refinements**: Reduce visual noise, improve whitespace, consistent typography
4. **Theme System Extension**: Support brand color overrides via data attributes

## Rollback

Revert `globals.css`, restore old component styles. No functional impact.

## Affected Files

- `src/app/globals.css`
- `src/components/ui/button.tsx`, `card.tsx`, `input.tsx`, etc.
- Layout files
- `tailwind.config.js`
