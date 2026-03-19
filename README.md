# MPOS: Modern Point of Sale System 🚀

This POS is a robust, full-stack Point of Sale and Inventory Management system built to showcase modern web development practices. It demonstrates how to build a scalable, real-time, multi-tenant B2B application handling complex business logic, transactions, and role-based access control.

This project serves as a comprehensive example of my ability to architect and deliver production-ready full-stack applications using the latest React and Node.js ecosystems.

---

## 🛠️ Technical Stack & Architecture

This project leverages a modern, bleeding-edge stack optimized for performance, developer experience, and scalability.

**Frontend:**
- **Framework:** Next.js 15 (App Router) & React 19
- **Styling:** Tailwind CSS v4, Radix UI Primitives, Framer Motion for micro-interactions
- **State Management & Data Fetching:** React Server Components, Server Actions, Context API
- **Forms & Validation:** React Hook Form integrated with Zod for end-to-end type safety
- **Real-time Updates:** Pusher WebSockets for instant state synchronization across clients
- **Hardware Integration:** `@zxing/browser` for barcode scanning, `html2canvas` + `jspdf` for cross-browser thermal receipt printing

**Backend & Infrastructure:**
- **Database:** PostgreSQL for relational data integrity
- **ORM:** Prisma 6 with strict typing and complex relational models
- **Authentication:** NextAuth.js v5 (Auth.js) supporting OAuth (Google, GitHub) and Credentials with secure hashing (Bcrypt)
- **Deployment:** Optimized for Vercel Serverless Functions

---

## � Key Engineering Highlights

### 1. Multi-Tenant Architecture
The database schema is inherently multi-tenant. Every core entity (Products, Categories, Orders, CashBoxes) is linked via a `businessId`. This allows multiple independent businesses to operate securely on the same instance without data leakage.

### 2. Real-Time Distributed State
Instead of relying solely on polling or manual refreshes, critical data (like the Cash Register total or Stock Alerts) uses **Pusher WebSockets**. When a sale is processed on Terminal A, the dashboard on Terminal B updates instantaneously.

### 3. E2E Type Safety & Server Actions
By heavily utilizing Next.js Server Actions and Zod, the application maintains strict type safety from the database schema up to the client-side forms. This eliminates an entire class of runtime errors and API payload mismatches.

### 4. Robust Database Modeling
The PostgreSQL schema (managed via Prisma) is designed for financial accuracy:
- **Immutable Orders:** When a sale occurs, `OrderItem` records snapshot the `costPrice`, `salePrice`, and `productName`. If a product's base price changes a month later, historical financial reports remain perfectly accurate.
- **Double-Entry Concepts:** Features explicit `StockMovement` and `CashMovement` logs. Adjustments, sales, and returns create traceable audit trails rather than just mutating balances.

### 5. Advanced Role-Based Access Control (RBAC)
Custom NextAuth callbacks inject the user's `role` and `businessId` directly into the JWT and Session. Middleware intercepts routes, ensuring that a standard `USER` cannot access `ADMIN` financial reports or cross-tenant data.

---

## 📐 Database Schema Overview

The core entities include:
- `Business`: The tenant root.
- `User`: Handles authentication and authorization.
- `Product`, `Category`, `Brand`, `Supplier`: Highly normalized inventory structure.
- `Order` & `OrderItem`: Transaction records with immutable pricing snapshots.
- `StockMovement` & `CashMovement`: Audit logs for inventory and cash flow.
- `CashBox`: Real-time aggregated balance tracking.

---

## 🚀 Getting Started Locally

### Prerequisites
- Node.js (v18+)
- PostgreSQL Database (Local or Cloud, e.g., Supabase/Neon)
- Pusher Account (for WebSockets)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/pos-template.git
   cd pos-template
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Setup:**
   Create a `.env` file based on `.env.example`. Required variables:
   - `DATABASE_URL`
   - `AUTH_SECRET` (generate via `npx auth secret`)
   - Pusher credentials (`NEXT_PUBLIC_PUSHER_APP_KEY`, `PUSHER_APP_ID`, etc.)
   - OAuth credentials (if using social login)

4. **Initialize Database:**
   ```bash
   npx prisma db push
   npx prisma generate
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```
   *Available at `http://localhost:3000`*

---

## 🤝 Let's Connect

I built this project to demonstrate my capability to handle complex, data-intensive architectures and deliver polished user interfaces. If you're a recruiter or engineering manager looking for a full-stack developer who understands both product needs and technical execution, I'd love to chat.
 Email: jerojimenez98@gmail.com
 Portfolio: https://portfolio-jeronimo-jimenez.vercel.app/
 
