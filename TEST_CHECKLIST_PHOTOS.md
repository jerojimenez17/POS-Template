# TEST CHECKLIST: Multi-Photo Support for Products

## Type Definitions
- [ ] `PublicProduct` type gains `images: string[]` field
- [ ] `PublicProduct` with no images but legacy `image` → `images: []`, `image` field populated
- [ ] `PublicProduct` with no images at all → `images: []`, `image` is null
- [ ] `PublicProduct` with `images` populated → carousel renders multiple photos

## Prisma Schema
- [ ] `ProductImage` model exists with `id`, `productId`, `url`, and relation to `Product`
- [ ] `Product.images` relation is defined (hasMany ProductImage)

## Server Actions
- [ ] `newProduct` with `newImages` array → uploads to Firebase, creates `ProductImage` rows
- [ ] `newProduct` with no `newImages` → does not call `productImage.createMany`
- [ ] `updateProduct` with `imagesToDelete` → deletes matching `ProductImage` rows
- [ ] `updateProduct` with `newImages` → creates new `ProductImage` rows
- [ ] `updateProduct` with both `newImages` and `imagesToDelete` → handles both

## Product Detail Page (Carousel)
- [ ] Multiple images → carousel arrows (previous/next) are visible
- [ ] Multiple images → dot indicators rendered for each image
- [ ] Clicking next arrow advances to the next image
- [ ] Single legacy image (only `image` field, no `images[]`) → image shown, no arrows, no dots
- [ ] No images at all → "no-image" placeholder displayed
- [ ] Empty `images[]` with populated `image` → falls back to legacy image
- [ ] Add-to-cart button is disabled when quantity is 0
- [ ] Add-to-cart button is enabled when quantity > 0
- [ ] Quantity +/- controls work correctly

## Product Card
- [ ] Product card shows first image from `images[]` when available
- [ ] Product card falls back to legacy `image` when `images[]` is empty
- [ ] Product card shows placeholder when no images exist

## Product Form (Stock)
- [ ] Form allows multiple file upload (newImages)
- [ ] Form sends `newImages` array to server action on submit
- [ ] Form sends `imagesToDelete` when existing images are removed

## Data Migration
- [ ] Existing products with `image` field are not broken (backward compat)
- [ ] `getPublicProductsByBusinessId` includes `images` in the select/return
- [ ] `getPublicProductById` includes `images` in the select/return
