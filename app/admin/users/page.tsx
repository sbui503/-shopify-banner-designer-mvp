import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getAdminData } from "@/lib/admin-data";

export default async function UsersPage() {
  const data = await getAdminData();

  return (
    <>
      <PageHeader
        title="User Management"
        description="Review connected admins, fulfillment users, roles, permissions, and recent activity."
        badge="Access Control"
      />

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Users and Roles</CardTitle>
            <CardDescription>Live users appear here after a user directory is connected.</CardDescription>
          </div>
          <Button disabled>Invite user</Button>
        </CardHeader>
        <CardContent>
          {data.users.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-sm text-muted-foreground">
              No user directory is connected. Login protection is configured through the deployment environment, and sample users are not shown.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Recent Activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.users.map((user) => (
                    <TableRow key={user.email}>
                      <TableCell className="font-semibold">{user.name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.role}</TableCell>
                      <TableCell>
                        <Badge variant={user.status === "Active" ? "success" : "warning"}>{user.status}</Badge>
                      </TableCell>
                      <TableCell>{user.lastActive}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
