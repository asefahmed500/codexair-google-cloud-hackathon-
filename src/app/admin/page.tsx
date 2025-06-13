
'use client';

import React, { useEffect, useState, type ChangeEvent } from 'react'; // Import React
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { AdminUserView } from '@/types';
import type { AdminSummaryStats } from '@/app/api/admin/summary-stats/route';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { ShieldAlert, Users, FolderGit2, FileScan, UserCheck, UserX } from 'lucide-react';

// Interface for UserTableRow props
interface UserTableRowProps {
  user: AdminUserView;
  currentSessionUser: AdminUserView | undefined | null; // Updated to reflect session.user structure
  adminCount: number;
  activeAdminCount: number;
  updatingUserId: string | null;
  onRoleChange: (userId: string, newRole: 'user' | 'admin') => void;
  onStatusChange: (userId: string, newStatus: 'active' | 'suspended') => void;
}

// Memoized UserTableRow component
const UserTableRow = React.memo(function UserTableRow({
  user,
  currentSessionUser,
  adminCount,
  activeAdminCount,
  updatingUserId,
  onRoleChange,
  onStatusChange,
}: UserTableRowProps) {
  const isCurrentUser = currentSessionUser?.id === user._id; // Assuming session user has 'id'
  const isLastAdmin = user.role === 'admin' && adminCount <= 1;
  const isLastActiveAdmin = user.role === 'admin' && user.status === 'active' && activeAdminCount <= 1;

  const disableRoleChange = updatingUserId === user._id || (isCurrentUser && isLastAdmin);
  const roleChangeTitle = (isCurrentUser && isLastAdmin) ? "Cannot change your own role as the last admin." : "";

  const disableStatusChange = updatingUserId === user._id || (isCurrentUser && isLastActiveAdmin && user.status === 'active');
  const statusChangeTitle = (isCurrentUser && isLastActiveAdmin && user.status === 'active') ? "Cannot suspend your own account as the last active admin." : (user.status === 'active' ? "Suspend User" : "Activate User");

  return (
    <TableRow key={user._id}>
      <TableCell className="font-medium">{user.name || 'N/A'}</TableCell>
      <TableCell>{user.email || 'N/A'}</TableCell>
      <TableCell>
        <Select
          value={user.role}
          onValueChange={(newRole) => onRoleChange(user._id, newRole as 'user' | 'admin')}
          disabled={disableRoleChange}
        >
          <SelectTrigger className="w-[120px]" disabled={disableRoleChange} title={roleChangeTitle}>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="admin">
              Admin {isLastAdmin && <ShieldAlert className="inline ml-1.5 h-3.5 w-3.5 text-destructive" title="Last admin account"/>}
            </SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Badge variant={user.status === 'active' ? 'default' : 'destructive'} className={`whitespace-nowrap ${user.status === 'active' ? 'bg-green-500/20 text-green-700 border-green-400' : 'bg-red-500/20 text-red-700 border-red-400'}`}>
          {user.status}
          {isLastActiveAdmin && user.status === 'active' && <ShieldAlert className="inline ml-1.5 h-3.5 w-3.5 text-destructive" title="Last active admin account"/>}
        </Badge>
      </TableCell>
      <TableCell>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onStatusChange(user._id, user.status === 'active' ? 'suspended' : 'active')}
          disabled={disableStatusChange}
          title={statusChangeTitle}
          className="whitespace-nowrap"
        >
          {user.status === 'active' ? <UserX className="mr-1 h-4 w-4" /> : <UserCheck className="mr-1 h-4 w-4" />}
          {user.status === 'active' ? 'Suspend' : 'Activate'}
        </Button>
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {user.createdAt && !isNaN(new Date(user.createdAt).getTime())
          ? format(new Date(user.createdAt), 'PPP')
          : 'N/A'}
      </TableCell>
    </TableRow>
  );
});


export default function AdminPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [errorUsers, setErrorUsers] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const [summaryStats, setSummaryStats] = useState<AdminSummaryStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [errorStats, setErrorStats] = useState<string | null>(null);

  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertAction, setAlertAction] = useState<{ userId: string; newRole?: 'user' | 'admin'; newStatus?: 'active' | 'suspended', actionType: 'role' | 'status' } | null>(null);

  const [adminCount, setAdminCount] = useState(0);
  const [activeAdminCount, setActiveAdminCount] = useState(0);

  const updateAdminCounts = (currentUsers: AdminUserView[]) => {
    setAdminCount(currentUsers.filter(u => u.role === 'admin').length);
    setActiveAdminCount(currentUsers.filter(u => u.role === 'admin' && u.status === 'active').length);
  };

  useEffect(() => {
    if (sessionStatus === 'loading') return;

    if (!session || session.user.role !== 'admin') {
      router.replace('/auth/signin'); // Or router.replace('/dashboard');
      return;
    }

    async function fetchAdminData() {
      setLoadingStats(true);
      setErrorStats(null);
      try {
        const statsResponse = await fetch('/api/admin/summary-stats');
        if (!statsResponse.ok) {
          const errorData = await statsResponse.json();
          throw new Error(errorData.error || 'Failed to fetch summary stats');
        }
        const statsData: AdminSummaryStats = await statsResponse.json();
        setSummaryStats(statsData);
      } catch (err: any) {
        setErrorStats(err.message);
        setSummaryStats(null);
      } finally {
        setLoadingStats(false);
      }

      setLoadingUsers(true);
      setErrorUsers(null);
      try {
        const usersResponse = await fetch('/api/admin/users');
        if (!usersResponse.ok) {
          const errorData = await usersResponse.json();
          throw new Error(errorData.error || 'Failed to fetch users');
        }
        const usersData = await usersResponse.json();
        const fetchedUsers: AdminUserView[] = usersData.users || [];
        setUsers(fetchedUsers);
        updateAdminCounts(fetchedUsers);
      } catch (err: any) {
        setErrorUsers(err.message);
        setUsers([]);
      } finally {
        setLoadingUsers(false);
      }
    }

    if (session && session.user.role === 'admin') {
      fetchAdminData();
    }
  }, [session, sessionStatus, router]);

  const confirmRoleChange = (userId: string, newRole: 'user' | 'admin') => {
    const userToUpdate = users.find(u => u._id === userId);
    if (!userToUpdate) return;

    if (userToUpdate.role === newRole) {
        toast({ title: "No Change", description: "The selected role is the same as the current role.", variant: "default"});
        return;
    }

    // Client-side check: prevent current admin from demoting themselves if they are the last admin
    if (session?.user?.id === userId && userToUpdate.role === 'admin' && newRole === 'user' && adminCount <= 1) {
        toast({ title: "Action Prohibited", description: "You cannot change your own role as the last admin.", variant: "destructive"});
        return;
    }


    setAlertAction({ userId, newRole, actionType: 'role' });
    setIsAlertOpen(true);
  };

  const confirmStatusChange = (userId: string, newStatus: 'active' | 'suspended') => {
    const userToUpdate = users.find(u => u._id === userId);
    if (!userToUpdate) return;

    if (userToUpdate.status === newStatus) {
        toast({ title: "No Change", description: `User is already ${newStatus}.`, variant: "default"});
        return;
    }

    // Client-side check: prevent current admin from suspending themselves if they are the last active admin
    if (session?.user?.id === userId && userToUpdate.role === 'admin' && userToUpdate.status === 'active' && newStatus === 'suspended' && activeAdminCount <= 1) {
        toast({ title: "Action Prohibited", description: "You cannot suspend your own account as the last active admin.", variant: "destructive"});
        return;
    }

    setAlertAction({ userId, newStatus, actionType: 'status'});
    setIsAlertOpen(true);
  };

  const handleUpdate = async () => {
    if (!alertAction) return;
    const { userId, newRole, newStatus, actionType } = alertAction;

    setUpdatingUserId(userId);
    try {
      const payload: any = { userId };
      if (actionType === 'role' && newRole) payload.newRole = newRole;
      if (actionType === 'status' && newStatus) payload.newStatus = newStatus;

      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update user');
      }

      toast({ title: "User Updated", description: result.message, variant: "default" });
      setUsers(prevUsers => {
        const updatedUsers = prevUsers.map(u =>
            (u._id === userId ? { ...u, ... (newRole && {role: newRole}), ...(newStatus && {status: newStatus}) } : u)
        );
        updateAdminCounts(updatedUsers); // Recalculate admin counts after update
        return updatedUsers;
      });

    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    } finally {
      setUpdatingUserId(null);
      setIsAlertOpen(false);
      setAlertAction(null);
    }
  };


  if (sessionStatus === 'loading' || (loadingUsers && !users.length && !errorUsers && loadingStats && !summaryStats && !errorStats )) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-48 mb-1" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4 mb-6">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
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
            <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 flex items-center justify-center">
                <Card className="text-center">
                <CardHeader><CardTitle className="text-destructive">Access Denied</CardTitle></CardHeader>
                <CardContent>
                    <p>You do not have permission to view this page.</p>
                    <Button onClick={() => router.push('/dashboard')} className="mt-4">Go to Dashboard</Button>
                </CardContent>
                </Card>
            </main>
        </div>
    );
  }

  const getAlertDescription = () => {
    if (!alertAction) return "";
    const { actionType, newRole, newStatus, userId } = alertAction;
    const userToUpdate = users.find(u => u._id === userId);
    if (!userToUpdate) return "User not found.";

    let description = "";
    if (actionType === 'role') {
      description = `Are you sure you want to change ${userToUpdate.email}'s role to ${newRole}?`;
      if (newRole === 'user' && userToUpdate.role === 'admin') {
        if (adminCount <= 1) {
          description += ` Warning: This is the last admin account. Demoting this user will remove all admin access from the system. This action is irreversible without database intervention.`;
        } else if (session?.user?.id === userId) {
          description += ` Warning: You are about to change your own role. You will lose admin privileges.`;
        }
      }
    } else if (actionType === 'status') {
      description = `Are you sure you want to change ${userToUpdate.email}'s status to ${newStatus}?`;
      if (newStatus === 'suspended' && userToUpdate.role === 'admin' && userToUpdate.status === 'active') {
        if (activeAdminCount <= 1) {
         description += ` Warning: This is the last active admin account. Suspending this user may lock out all admin functionality. This action is irreversible without database intervention if no other active admins exist.`;
        } else if (session?.user?.id === userId) {
          description += ` Warning: You are about to suspend your own account. You will be logged out and lose admin access.`;
        }
      }
    }
    return description;
  };


  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <Card className="shadow-lg mb-8">
          <CardHeader>
            <CardTitle className="text-2xl sm:text-3xl font-bold font-headline">Admin Dashboard</CardTitle>
            <CardDescription>Manage users, roles, status, and view platform statistics.</CardDescription>
          </CardHeader>
          <CardContent>
            <h2 className="text-xl font-semibold mb-4 text-foreground">Platform Overview</h2>
            {loadingStats && <div className="grid md:grid-cols-3 gap-4 mb-6"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}
            {errorStats && <p className="text-destructive mb-4">Error loading platform stats: {errorStats}</p>}
            {summaryStats && !loadingStats && (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 mb-8">
                <StatCard Icon={Users} title="Total Users" value={summaryStats.totalUsers} />
                <StatCard Icon={FolderGit2} title="Total Projects" value={summaryStats.totalRepositories} description="Repositories synced" />
                <StatCard Icon={FileScan} title="Total PRs Analyzed" value={summaryStats.totalAnalyses} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
             <h2 className="text-xl font-semibold text-foreground">User Management</h2>
          </CardHeader>
          <CardContent>
            {loadingUsers && users.length === 0 && <Skeleton className="h-64 w-full" />}
            {errorUsers && <p className="text-destructive">Error loading users: {errorUsers}</p>}
            {!loadingUsers && users.length === 0 && !errorUsers && (
                <p className="text-muted-foreground">No users found.</p>
            )}
            {!loadingUsers && users.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <UserTableRow
                      key={user._id}
                      user={user}
                      currentSessionUser={session?.user as AdminUserView | undefined | null} // Cast session.user
                      adminCount={adminCount}
                      activeAdminCount={activeAdminCount}
                      updatingUserId={updatingUserId}
                      onRoleChange={confirmRoleChange}
                      onStatusChange={confirmStatusChange}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            )}
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={isAlertOpen} onOpenChange={setIsAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-line">
              {getAlertDescription()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {setAlertAction(null); setIsAlertOpen(false);}}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpdate} disabled={updatingUserId === alertAction?.userId}>
              {updatingUserId === alertAction?.userId ? 'Updating...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <footer className="py-6 border-t bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} codexair Admin.
        </div>
      </footer>
    </div>
  );
}

interface StatCardProps {
  Icon: React.ElementType;
  title: string;
  value: string | number;
  description?: string;
}
function StatCard({ Icon, title, value, description }: StatCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-5 w-5 text-accent" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-foreground">{value}</div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

    
