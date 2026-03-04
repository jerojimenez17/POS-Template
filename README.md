# Genesis POS: The Next-Generation Point of Sale & SaaS Platform 🚀

Welcome to **Genesis POS**, a meticulously crafted, multi-tenant Point of Sale (POS) boilerplate designed to launch your next B2B SaaS in record time. Whether you're building a retail management system, a restaurant order tracker, or an enterprise inventory platform, Genesis POS provides the enterprise-grade foundation you need to scale from day one.

Quit reinventing the wheel. Genesis handles the heavy lifting—authentication, multi-tenant data segregation, real-time updates, and inventory tracking—so you can focus on building your unique business logic.

---

## 💎 Why Choose Genesis POS?

- **Multi-Tenant by Design:** Built from the ground up to support multiple isolated businesses, each with their own products, sales, and employee accounts.
- **Lightning Fast & Real-Time:** We don't just rely on standard HTTP. With integrated **WebSockets (Pusher)**, cash register balances and critical stock alerts update instantaneously across all connected devices.
- **Enterprise-Grade Security:** Role-Based Access Control (RBAC) enforces strict boundaries between Super Admins, Business Admins, and standard Users.
- **Beautiful, Modern UI:** Crafted with tailwindcss, Radix UI, and Framer Motion for a buttery-smooth, natively-feeling web experience. Fully responsive and Dark Mode ready.
- **Hardware Ready:** Built-in support for barcode scanners (`@zxing/browser`, `usb barcode scanners`) and seamless thermal printer integration (`react-to-print`).

---

## 🛠 Tech Stack (Under the Hood)

Genesis POS leverages the cutting-edge bleeding edge of the React and Node.js ecosystems:

### Frontend
- **Framework:** [Next.js 15 (App Router)](https://nextjs.org/) & React 19
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) & [Radix UI](https://www.radix-ui.com/) Primitives
- **Animations:** [Framer Motion](https://www.framer.com/motion/)
- **Forms & Validation:** [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/)
- **Data Tables:** [TanStack Table v8](https://tanstack.com/table/latest)

### Backend & Database
- **Database:** PostgreSQL via [Prisma ORM 6](https://www.prisma.io/)
- **Authentication:** [NextAuth.js v5 (Beta)](https://authjs.dev/) (OAuth + Credentials + Prisma Adapter)
- **Real-time:** [Pusher WebSockets](https://pusher.com/)
- **Server Logic:** Next.js Server Actions (No external API needed)

---

## 📦 Core Modules Included

1. **Authentication & RBAC:** Secure login (Google, GitHub, Facebook, Credentials) with account linking and email verification.
2. **Business Management (Multi-tenant):** Create and manage isolated business work-spaces.
3. **Point of Sale (Billing):** A blazing-fast, keyboard-friendly checkout interface supporting multiple payment methods per order, split payments, and discounts.
4. **Inventory Management:** Complete tracking of Products, Categories, Brands, and Suppliers.
5. **Stock Logs & Movements:** Immutable audit logs for every stock entry, return, or adjustment.
6. **Cash Register (CashBox):** Real-time tracking of cash flow, partial deposits, and withdrawals.
7. **Client Ledger:** Keep track of client balances, credits, and historical orders.
8. **Automated Reports:** Daily summaries, product sales rankings, and revenue tracking metrics.

---

## 🚀 Getting Started

Follow these steps to deploy Genesis POS on your local machine:

### 1. Clone the repository
```bash
git clone https://github.com/your-username/pos-template.git
cd pos-template
```

### 2. Install Dependencies
```bash
npm install
# or yarn install / pnpm install
```

### 3. Environment Variables
Create a `.env.local` or `.env` file at the root of the project. Use the provided `.env.example` as a reference. You will need:
- `DATABASE_URL` (Your PostgreSQL connection string)
- `AUTH_SECRET` (Run `npx auth secret` to generate)
- `NEXT_PUBLIC_PUSHER_APP_KEY`, `PUSHER_APP_ID`, `PUSHER_SECRET`, `NEXT_PUBLIC_PUSHER_CLUSTER` (For real-time functionality)
- OAuth Client IDs and Secrets (Google/GitHub/Facebook) if using Social Logins.

### 4. Database Setup & Prisma
Push the schema to your PostgreSQL database and generate the client:
```bash
npx prisma db push
npx prisma generate
```

### 5. Run the Development Server
```bash
npm run dev
```
Navigate to [http://localhost:3000](http://localhost:3000) to start your journey.

---

## 📖 Deep Dive: The Data Model

Our robust Prisma schema is designed to scale:

- **Business:** The core tenant model.
- **User / Account:** Handled natively by NextAuth with extended `role` and `businessId` fields.
- **Product ecosystem:** Extensively normalized with `Category`, `Subcategory`, `Brand`, and `Supplier`.
- **Order & OrderItem:** Immutable snapshots of sales, ensuring historical pricing data never breaks even if base product costs change.
- **StockMovement & CashMovement:** Double-entry-like auditing for physical goods and cash flow.

---

## 🚀 Deployment

Genesis POS is heavily optimized for seamless deployment on serverless platforms. 

The easiest path to production is via [Vercel](https://vercel.com/new). Just connect your repository, add your environment variables to the Vercel dashboard, and hit deploy. Next.js handles the rest!

---

*Transform the way businesses manage their operations. Power your next big idea with Genesis POS.*
