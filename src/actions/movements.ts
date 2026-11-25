"use server";

import { db } from "@/lib/db";
import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { auth } from "../../auth";

import { pusherServer } from "@/lib/pusher-server";
import { assertWritePermission } from "@/lib/auth-gates";

interface MovementFilters {
  fromDate?: string;
  toDate?: string;
  paymentMethod: "CASH" | "ALL";
}

interface MovementDate {
  year: number;
  month: number;
  day: number;
}

const DEFAULT_BUSINESS_TIMEZONE = "America/Argentina/Buenos_Aires";

const parseCalendarDate = (value: unknown): MovementDate | null => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;

  return { year, month, day };
};

const calendarDateString = ({ year, month, day }: MovementDate): string =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const nextCalendarDate = (date: MovementDate): MovementDate => {
  const next = new Date(0);
  next.setUTCHours(0, 0, 0, 0);
  next.setUTCFullYear(date.year, date.month - 1, date.day + 1);
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
};

const getZonedParts = (instant: Date, timeZone: string): MovementDate & { hour: number; minute: number; second: number } => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const partValue = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: partValue("year"),
    month: partValue("month"),
    day: partValue("day"),
    hour: partValue("hour"),
    minute: partValue("minute"),
    second: partValue("second"),
  };
};

const zonedDateTimeToInstant = (date: MovementDate, timeZone: string): Date => {
  const wallClockUtc = new Date(0);
  wallClockUtc.setUTCHours(0, 0, 0, 0);
  wallClockUtc.setUTCFullYear(date.year, date.month - 1, date.day);
  const wallClockTimestamp = wallClockUtc.getTime();
  const offsets = new Set<number>();

  // Sample both sides of any nearby DST transition; offsets are then used to
  // resolve the local midnight without assuming that a calendar day is 24h.
  for (let hours = -48; hours <= 48; hours += 6) {
    const sample = new Date(wallClockTimestamp + hours * 60 * 60 * 1000);
    const local = getZonedParts(sample, timeZone);
    const localAsUtc = new Date(0);
    localAsUtc.setUTCHours(local.hour, local.minute, local.second, 0);
    localAsUtc.setUTCFullYear(local.year, local.month - 1, local.day);
    offsets.add(localAsUtc.getTime() - sample.getTime());
  }

  const candidates = [...offsets].map((offset) => new Date(wallClockTimestamp - offset));
  const matches = candidates.filter((candidate) => {
    const local = getZonedParts(candidate, timeZone);
    return (
      local.year === date.year && local.month === date.month && local.day === date.day &&
      local.hour === 0 && local.minute === 0 && local.second === 0
    );
  });
  if (matches.length > 0) {
    return new Date(Math.min(...matches.map((candidate) => candidate.getTime())));
  }

  // Some regions have historically skipped midnight (or an entire calendar
  // date). In that case, use the first sampled-offset candidate on the first
  // available local date at or after the requested calendar date.
  const requestedDate = calendarDateString(date);
  const afterGap = candidates
    .filter((candidate) => calendarDateString(getZonedParts(candidate, timeZone)) >= requestedDate)
    .sort((left, right) => left.getTime() - right.getTime());
  if (afterGap.length > 0) return afterGap[0];

  throw new Error("Could not resolve business-local calendar boundary");
};

const getBusinessTimezone = (value: unknown): string => {
  if (typeof value !== "string" || value.length === 0) return DEFAULT_BUSINESS_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return DEFAULT_BUSINESS_TIMEZONE;
  }
};

const roundMovementToPeso = (amount: number): number => {
  const roundedMagnitude = Math.floor(Math.abs(amount) + 0.5);
  return amount < 0 ? -roundedMagnitude : roundedMagnitude;
};

const isMovementFilters = (value: unknown): value is MovementFilters => {
  if (typeof value !== "object" || value === null) return false;
  const filters = value as Record<string, unknown>;
  if (filters.paymentMethod !== "CASH" && filters.paymentMethod !== "ALL") return false;
  if (filters.fromDate !== undefined && filters.fromDate !== "" && !parseCalendarDate(filters.fromDate)) return false;
  if (filters.toDate !== undefined && filters.toDate !== "" && !parseCalendarDate(filters.toDate)) return false;

  const fromDate = filters.fromDate === "" ? undefined : parseCalendarDate(filters.fromDate);
  const toDate = filters.toDate === "" ? undefined : parseCalendarDate(filters.toDate);
  return !fromDate || !toDate || calendarDateString(fromDate) <= calendarDateString(toDate);
};

export const createMovement = async (data: {
  total: number;
  seller?: string;
  paidMethod?: string;
  date?: Date;
}) => {
  const session = await auth();
  if (!session?.user?.businessId) return { error: "No autorizado" };

  const permission = await assertWritePermission();
  if (!permission.success) return { error: permission.error, code: permission.code };

  try {
    const movement = await db.cashMovement.create({
      data: {
        total: data.total,
        seller: data.seller,
        paidMethod: data.paidMethod,
        date: data.date || new Date(),
        business: { connect: { id: session.user.businessId } },
      },
    });
    
    await pusherServer.trigger(
      `movements-${session.user.businessId}`,
      "new-movement",
      movement
    );

    revalidateTag(CACHE_TAGS.MOVEMENTS, "max"); 
    return { success: "Movimiento registrado", movement };
  } catch (error) {
    console.error(error);
    return { error: "Error al guardar movimiento" };
  }
};

export const getMovements = async () => {
    const session = await auth();
    if (!session?.user?.businessId) return [];

    try {
        const movements = await db.cashMovement.findMany({
            where: {
                businessId: session.user.businessId,
            },
            orderBy: { date: 'desc' }
        });
        return movements;
    } catch (error) {
        console.error(error);
        return [];
    }
}

export const getFilteredMovements = async (input: MovementFilters) => {
  let businessId: string | undefined;
  try {
    const session = await auth();
    businessId = session?.user?.businessId ?? undefined;
  } catch (error) {
    console.error(
      "Error authenticating filtered cash movement read:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return { success: false as const, error: "No se pudo validar el acceso a los movimientos" };
  }
  if (!businessId) return { success: false as const, error: "No autorizado para consultar movimientos" };
  if (!isMovementFilters(input)) {
    return { success: false as const, error: "Los filtros de movimientos no son válidos" };
  }

  try {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    const timeZone = getBusinessTimezone(business?.timezone);
    const fromDate = input.fromDate ? parseCalendarDate(input.fromDate) : null;
    const toDate = input.toDate ? parseCalendarDate(input.toDate) : null;

    const date: { gte?: Date; lt?: Date } = {};
    if (fromDate) date.gte = zonedDateTimeToInstant(fromDate, timeZone);
    if (toDate) date.lt = zonedDateTimeToInstant(nextCalendarDate(toDate), timeZone);

    const movements = await db.cashMovement.findMany({
      where: {
        businessId,
        ...(Object.keys(date).length > 0 ? { date } : {}),
        ...(input.paymentMethod === "CASH" ? { paidMethod: "Efectivo" } : {}),
      },
      select: { id: true, total: true, seller: true, paidMethod: true, date: true },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    });

    let roundedTotal = BigInt(0);
    for (const movement of movements) {
      if (!Number.isFinite(movement.total)) {
        return { success: false as const, error: "No se pudo calcular el total de movimientos" };
      }
      const rounded = roundMovementToPeso(movement.total);
      if (!Number.isSafeInteger(rounded)) {
        return { success: false as const, error: "El monto excede el rango de cálculo permitido" };
      }
      roundedTotal += BigInt(rounded);
    }

    if (
      roundedTotal > BigInt(Number.MAX_SAFE_INTEGER) ||
      roundedTotal < BigInt(Number.MIN_SAFE_INTEGER)
    ) {
      return { success: false as const, error: "El total excede el rango de cálculo permitido" };
    }

    return { success: true as const, movements, total: Number(roundedTotal) };
  } catch (error) {
    console.error(
      "Error loading filtered cash movements:",
      error instanceof Error ? error.name : "Unknown error",
    );
    return { success: false as const, error: "No se pudo cargar el historial de movimientos" };
  }
};
