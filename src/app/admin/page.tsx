
'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/dialog'; // Updated import
import type { AdminUserView } from '@/types';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { ShieldAlert } from 'lucide-react';


export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

  // State for AlertDialog
  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertAction, setAlertAction] = useState<{ userId: string; newRole: 'user' | 'admin' } | null>(null);
  
  const [adminCount, setAdminCount] = useState(0);

  useEffect(() => {
    if (status === 'loading') return; 

    if (!session || session.user.role !== 'admin') {
      router.replace('/auth/signin'); 
      return;
    }

    async function fetchUsers() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/admin/users');
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch users');
        }
        const data = await response.json();
        const fetchedUsers: AdminUserView[] = data.users || [];
        setUsers(fetchedUsers);
        setAdminCount(fetchedUsers.filter(u => u.role === 'admin').length);
      } catch (err: any) {
        setError(err.message);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }

    if (session && session.user.role === 'admin') {
      fetchUsers();
    }
  }, [session, status, router]);

  const confirmRoleChange = (userId: string, newRole: 'user' | 'admin') => {
    const userToUpdate = users.find(u => u._id === userId);
    if (!userToUpdate) return;

    if (userToUpdate.role === newRole) {
        toast({ title: "No Change", description: "The selected role is the same as the current role.", variant: "default"});
        return;
    }

    setAlertAction({ userId, newRole });
    setIsAlertOpen(true);
  };

  const handleRoleUpdate = async () => {
    if (!alertAction) return;
    const { userId, newRole } = alertAction;

    setUpdatingRoleId(userId);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newRole }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update role');
      }
      
      toast({ title: "Role Updated", description: `User's role changed to ${newRole}.`, variant: "default" });
      setUsers(prevUsers =>
        prevUsers.map(u => (u._id === userId ? { ...u, role: newRole } : u))
      );
      setAdminCount(users.filter(u => u.role === 'admin').map(u => (u._id === userId ? { ...u, role: newRole } : u)).filter(u => u.role === 'admin').length);

    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    } finally {
      setUpdatingRoleId(null);
      setIsAlertOpen(false);
      setAlertAction(null);
    }
  };


  if (status === 'loading' || (loading && (!users.length && !error))) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 container py-8">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-48 mb-1" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full mb-2" />
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (!session || session.user.role !== 'admin') {
    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-1 container py-8 flex items-center justify-center">
                <Card className="text-center">
                <CardHeader><CardTitle className="text-destructive">Access Denied</CardTitle></CardHeader>
                <CardContent>
                    <p>You do not have permission to view this page.</p>
                </CardContent>
                </Card>
            </main>
        </div>
    );
  }
  
  if (error) {
    return (
        <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-1 container py-8">
                <Card className="text-center">
                    <CardHeader><CardTitle className="text-destructive">Error Loading Users</CardTitle></CardHeader>
                    <CardContent><p>{error}</p></CardContent>
                </Card>
            </main>
        </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar />
      <main className="flex-1 container py-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-3xl font-bold font-headline">Admin Dashboard</CardTitle>
            <CardDescription>Manage users and their roles within the application.</CardDescription>
          </CardHeader>
          <CardContent>
            <h2 className="text-xl font-semibold mb-4 text-foreground">User Management</h2>
            {users.length === 0 ? (
                <p className="text-muted-foreground">No users found.</p>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Current Role</TableHead>
                  <TableHead>Change Role</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const isCurrentUserLastAdmin = session.user.id === user._id && user.role === 'admin' && adminCount <= 1;
                  return (
                    <TableRow key={user._id}>
                      <TableCell className="font-medium">{user.name || 'N/A'}</TableCell>
                      <TableCell>{user.email || 'N/A'}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' ? 'destructive' : 'secondary'}>
                          {user.role}
                          {isCurrentUserLastAdmin && <ShieldAlert className="inline ml-1.5 h-3.5 w-3.5" />}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          defaultValue={user.role}
                          onValueChange={(newRole) => confirmRoleChange(user._id, newRole as 'user' | 'admin')}
                          disabled={updatingRoleId === user._id || isCurrentUserLastAdmin}
                        >
                          <SelectTrigger className="w-[120px]" disabled={isCurrentUserLastAdmin} title={isCurrentUserLastAdmin ? "Cannot change role of the last admin." : ""}>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{format(new Date(user.createdAt), 'PPP')}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            )}
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Role Change</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change this user's role to <span className="font-semibold">{alertAction?.newRole}</span>?
              {alertAction?.newRole === 'user' && users.find(u => u._id === alertAction?.userId)?.role === 'admin' && adminCount <= 1 && (
                <span className="block mt-2 text-destructive font-semibold"><ShieldAlert className="inline mr-1.5 h-4 w-4" />Warning: This is the last admin account. Demoting this user will remove all admin access.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setAlertAction(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRoleUpdate} disabled={updatingRoleId === alertAction?.userId}>
              {updatingRoleId === alertAction?.userId ? 'Updating...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <footer className="py-6 border-t bg-background">
        <div className="container text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} codexair Admin.
        </div>
      </footer>
    </div>
  );
}
