
import { db } from "@/lib/db";
import { UserRole } from "@prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PromoteUserButton } from "@/components/Superadmin/promote-button";
import { auth } from "../../../../auth";

export default async function SuperAdminDashboard() {
  const session = await auth();

  // Fetch all users
  const users = await db.user.findMany({
      include: {
          business: true // Include business if they have one
      }
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">User Management</h1>
      
      <Card>
        <CardHeader>
            <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Actions</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {users.map((user) => (
                    <TableRow key={user.id}>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.role}</TableCell>
                    <TableCell>{user.business?.name || "None"}</TableCell>
                    <TableCell>
                        <PromoteUserButton userId={user.id} currentRole={user.role} hasBusiness={!!user.businessId} />
                    </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
        </CardContent>
      </Card>
    </div>
  );
}
