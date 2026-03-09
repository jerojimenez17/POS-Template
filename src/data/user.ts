import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

export type UserWithBusiness = Prisma.UserGetPayload<{
  include: { business: true }
}>;

export const getUserByEmail = async (email: string) => {
  try {
    const user = await db.user.findUnique({ where: { email } });
    return user;
  } catch {
    return null;
  }
};
export const getUserById = async (id: string): Promise<UserWithBusiness | null> => {
  try {
    const user = await db.user.findUnique({ 
      where: { id },
      include: { business: true }
    });
    return user as UserWithBusiness | null;
  } catch {
    return null;
  }
};
