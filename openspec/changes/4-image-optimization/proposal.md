# Change: image-optimization

**Source:** C-06 (docs/enhancements/03-cons.md), F3 (Fetching & Images)  
**Phase:** 4 — Caching & Images  
**Effort:** ~2 days  
**Risk:** Medium  

## Problem

Product images served from Firebase Storage without optimization:
- No `next/image` optimization — raw full-size images served
- No thumbnail generation — 4000x3000 images sent to catalog
- No lazy loading or blur placeholders
- Firebase remote pattern configured but minimal

## Scope

`next.config.ts`, components displaying product images, Firebase upload logic.

## Solution

1. **next/image**: Configure proper `remotePatterns`, formats (webp/avif), and device sizes
2. **Replace `<img>`**: Use `next/image` with `sizes`, `loading="lazy"`, and blur placeholder
3. **Thumbnail strategy**: Generate thumbnails at upload time (via Cloud Function or client-side resize)

## Rollback

Revert `next.config.ts`, replace `next/image` with `<img>`.

## Affected Files

- `next.config.ts` — image optimization config
- `src/components/catalog/ProductDetail.tsx` — product images
- `src/components/stock/` — product image display
- `src/app/(protected)/newBill/` — billing interface product images
