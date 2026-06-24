# TEST_CHECKLIST.md — Print Tags A4 Grid

## Acceptance Criteria Test Coverage

### AC1: code-bar-modal — 6cm × 3.5cm without codebar
| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| TC-CBM-001 | Tag card inline width when `codebar` is null | `6cm` | 🔴 |
| TC-CBM-002 | Tag card inline height when `codebar` is null | `3.5cm` | 🔴 |
| TC-CBM-003 | No barcode SVG rendered when `codebar` is null/empty | No `.label-barcode` / no `<svg>` for barcode | 🔴 |

### AC2: code-bar-modal — 6cm × 5cm with codebar + barcode at bottom
| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| TC-CBM-004 | Tag card inline width when `codebar` is present | `6cm` | 🔴 |
| TC-CBM-005 | Tag card inline height when `codebar` is present | `5cm` | 🔴 |
| TC-CBM-006 | Barcode SVG rendered when `codebar` is present | Barcode element exists in DOM | 🔴 |
| TC-CBM-007 | Barcode is at bottom of tag (after product code) | `compareDocumentPosition` shows code before barcode | 🔴 |

### AC3: code-bar-modal — format "thermal"
| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| TC-CBM-008 | `printElement` called with `format: "thermal"` | Mock verified | 🔴 |
| TC-CBM-009 | `pageStyle` contains thermal `@page` sizing | Page style includes `@page` rules | 🔴 |

### AC4: product-print-modal — A4 grid with format "a4"
| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| TC-PPM-001 | Print container uses CSS grid (not flex) | `display: grid` inline style | 🔴 |
| TC-PPM-002 | Grid has 3 columns of 6cm | `grid-template-columns: repeat(3, 6cm)` | 🔴 |
| TC-PPM-003 | `printElement` called with `format: "a4"` | Mock verified | 🔴 |
| TC-PPM-004 | `pageStyle` contains `@page { size: A4; margin: 5mm; }` | Page style includes A4 sizing | 🔴 |

### AC5: product-print-modal — 3.5cm tags without barcode (~24 per page)
| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| TC-PPM-005 | Tag width is `6cm` for no-codebar products | Inline style | 🔴 |
| TC-PPM-006 | Tag height is `3.5cm` for no-codebar products | Inline style | 🔴 |
| TC-PPM-007 | No barcode rendered for products without `codebar` | No barcode element in those tags | 🔴 |

### AC6: product-print-modal — 5cm tags with barcode (~15 per page)
| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| TC-PPM-008 | Tag width is `6cm` for codebar products | Inline style | 🔴 |
| TC-PPM-009 | Tag height is `5cm` for codebar products | Inline style | 🔴 |
| TC-PPM-010 | Barcode rendered for products with `codebar` | Barcode element exists in those tags | 🔴 |

### AC7: Mixed batch — uniform 5cm height
| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| TC-PPM-011 | Mixed codebar/null batch uses uniform 5cm height | All tags have height `5cm` | 🔴 |
| TC-PPM-012 | Products without codebar in mixed batch do NOT render barcode | No barcode for those tags | 🔴 |

### AC8: Page breaks between A4 pages
| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| TC-PPM-013 | Page-break-after style exists between page groups | Elements with `page-break-after: always` exist | 🔴 |
| TC-PPM-014 | Tags are grouped into multiple page containers when exceeding capacity | Distinct parent elements for tags on different pages | 🔴 |

### AC9: Tag content — description, price, code, optional barcode
| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| TC-PPM-015 | Product description rendered on each tag | Text visible in DOM | 🔴 |
| TC-PPM-016 | Sale price with unit suffix rendered on each tag | Formatted price visible | 🔴 |
| TC-PPM-017 | Product code rendered on each tag | Product code visible | 🔴 |
| TC-PPM-018 | Product code appears BEFORE barcode in DOM order | code < barcode in `compareDocumentPosition` | 🔴 |

### AC10: Copies multiplier works in bulk A4 mode
| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| TC-PPM-019 | Increasing copies multiplies total rendered tags | N tags × copies copies visible | 🔴 |
| TC-PPM-020 | Multiplied tags paginated across multiple A4 pages | Multiple page groups when tags > capacity | 🔴 |

### AC11: Editable description preserved for A4 layout
| ID | Description | Expected Result | Status |
|----|-------------|-----------------|--------|
| TC-PPM-021 | Description is contentEditable | `contentEditable` attribute set to `"true"` | 🔴 |
| TC-PPM-022 | Description can be edited by user | `fireEvent.input` changes text content | 🔴 |

---

## Test File Summary

| File | Type | Tests |
|------|------|-------|
| `src/__tests__/components/ProductPrintModal.test.tsx` | Updated | 18 tests (7 kept/modified + 11 new) |
| `src/__tests__/components/CodeBarModal.test.tsx` | New | 10 tests |

Legend: 🔴 = Not yet implemented (TDD Red phase), 🟢 = Passing, 🟡 = Partial
