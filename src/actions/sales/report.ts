"use server";

import { getDailyReportAction as runDailyReport } from "./history";

// `history.ts` is a server-only module without the "use server" directive, so
// importing its report function directly into the client component bundled
// Prisma/auth into the browser and the report never loaded. This thin server
// action preserves the implementation while giving the client a real action
// boundary (same pattern as get-sales.ts / unique-sellers.ts).
export const getDailyReportAction = async (startDate: Date, endDate?: Date) => {
  return runDailyReport(startDate, endDate);
};
