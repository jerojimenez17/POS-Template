# Design: bundle-optimization

## Approach

Each optimization is independent. Execute in any order.

## Audit

| Package | Size | Files | Action |
|---------|------|-------|--------|
| moment | ~200KB | 8 files | Replace with date-fns |
| xlsx | ~500KB | 2 files | Dynamic import |
| jspdf | ~400KB | 1 file | Dynamic import |
| html2canvas | ~200KB | 1 file | Dynamic import |
| framer-motion | ~150KB | 3 files | Replace with CSS |
| react-hot-toast | ~20KB | 4 files | Migrate to sonner |

## Execution Plan

### T1: moment → date-fns
For each file:
- Replace `import moment from "moment"` with needed date-fns imports
- `moment().format('DD/MM/YYYY')` → `format(new Date(), 'dd/MM/yyyy')`
- `moment(date).format('DD/MM/YYYY HH:mm')` → `format(date, 'dd/MM/yyyy HH:mm')`
- `moment(date).format('MMMM YYYY')` → `format(date, 'MMMM yyyy')`
- `moment(date).format('DD')` → `format(date, 'dd')`
- `moment(date).locale('es').format(...)` → `format(date, 'pattern', { locale: es })`

### T2: Dynamic import xlsx
```typescript
// Before:
import * as XLSX from "xlsx";
// After:
const XLSX = await import("xlsx");
```

### T3: Dynamic import jspdf + html2canvas
```typescript
// Before:
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
// After:
const html2canvas = (await import("html2canvas")).default;
const { jsPDF } = await import("jspdf");
```

### T4: framer-motion → CSS
Replace `motion.div` + AnimatePresence with CSS transitions:
```tsx
// Before:
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
// After:
<div className="transition-opacity duration-300">
```

### T5: react-hot-toast → sonner
- Replace `toast()` calls (import from sonner instead)
- Replace `<Toaster />` in layout with sonner's `<Toaster />`
- Remove react-hot-toast from package.json

## Verification
- Build passes
- Tests pass with same or better results
- Dynamic imports verified (no regression in functionality)
