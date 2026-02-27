
import { db } from "@/lib/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "../../../../auth";

export default async function BusinessesPage() {
  await auth();

  const businesses = await db.business.findMany({
    include: {
        users: true,
        _count: {
            select: { products: true, orders: true }
        }
    }
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Business Management</h1>
      
      <Card>
        <CardHeader>
            <CardTitle>All Businesses</CardTitle>
        </CardHeader>
        <CardContent>
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Created At</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {businesses.map((business) => (
                    <TableRow key={business.id}>
                    <TableCell>{business.name}</TableCell>
                    <TableCell>{business.slug}</TableCell>
                    <TableCell>{business.users.find(u => u.id === business.userId)?.email || "N/A"}</TableCell>
                    <TableCell>{business._count.products}</TableCell>
                    <TableCell>{business._count.orders}</TableCell>
                    <TableCell>{business.createdAt.toLocaleDateString()}</TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
        </CardContent>
      </Card>
    </div>
  );
}
