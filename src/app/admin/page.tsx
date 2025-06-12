
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { AdminUserView } from '@/types';
import type { AdminSummaryStats } from '@/app/api/admin/summary-stats/route'; 
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { ShieldAlert, Users, FolderGit2, FileScan, UserCheck, UserX } from 'lucide-react';


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

  useEffect(() => {
    if (sessionStatus === 'loading') return; 

    if (!session || session.user.role !== 'admin') {
      router.replace('/auth/signin'); 
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
        setAdminCount(fetchedUsers.filter(u => u.role === 'admin').length);
        setActiveAdminCount(fetchedUsers.filter(u => u.role === 'admin' && u.status === 'active').length);
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
        setAdminCount(updatedUsers.filter(u => u.role === 'admin').length);
        setActiveAdminCount(updatedUsers.filter(u => u.role === 'admin' && u.status === 'active').length);
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
        <main className="flex-1 container py-8">
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
  
  const getAlertDescription = () => {
    if (!alertAction) return "";
    const { actionType, newRole, newStatus, userId } = alertAction;
    const userToUpdate = users.find(u => u._id === userId);

    if (actionType === 'role') {
      let description = `Are you sure you want to change this user's role to ${newRole}?`;
      if (newRole === 'user' && userToUpdate?.role === 'admin' && adminCount <= 1) {
        description += ` Warning: This is the last admin account. Demoting this user will remove all admin access.`;
      }
      return description;
    }
    if (actionType === 'status') {
      let description = `Are you sure you want to change this user's status to ${newStatus}?`;
      if (newStatus === 'suspended' && userToUpdate?.role === 'admin' && userToUpdate?.status === 'active' && activeAdminCount <= 1) {
         description += ` Warning: This is the last active admin. Suspending this account may lock out admin functionality.`;
      }
      return description;
    }
    return "";
  };


  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar />
      <main className="flex-1 container py-8">
        <Card className="shadow-lg mb-8">
          <CardHeader>
            <CardTitle className="text-3xl font-bold font-headline">Admin Dashboard</CardTitle>
            <CardDescription>Manage users, roles, status, and view platform statistics.</CardDescription>
          </CardHeader>
          <CardContent>
            <h2 className="text-xl font-semibold mb-4 text-foreground">Platform Overview</h2>
            {loadingStats && <div className="grid md:grid-cols-3 gap-4 mb-6"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}
            {errorStats && <p className="text-destructive mb-4">Error loading platform stats: {errorStats}</p>}
            {summaryStats && !loadingStats && (
              <div className="grid md:grid-cols-3 gap-6 mb-8">
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
                {users.map((user) => {
                  const isCurrentUserLastAdmin = session.user.id === user._id && user.role === 'admin' && adminCount <= 1;
                  const isCurrentUserLastActiveAdmin = session.user.id === user._id && user.role === 'admin' && user.status === 'active' && activeAdminCount <= 1;
                  
                  return (
                    <TableRow key={user._id}>
                      <TableCell className="font-medium">{user.name || 'N/A'}</TableCell>
                      <TableCell>{user.email || 'N/A'}</TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(newRole) => confirmRoleChange(user._id, newRole as 'user' | 'admin')}
                          disabled={updatingUserId === user._id || isCurrentUserLastAdmin}
                        >
                          <SelectTrigger className="w-[120px]" disabled={isCurrentUserLastAdmin} title={isCurrentUserLastAdmin ? "Cannot change role of the last admin." : ""}>
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">User</SelectItem>
                            <SelectItem value="admin">Admin {isCurrentUserLastAdmin && <ShieldAlert className="inline ml-1.5 h-3.5 w-3.5" />}</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                       <TableCell>
                        <Badge variant={user.status === 'active' ? 'default' : 'destructive'} className={user.status === 'active' ? 'bg-green-500/20 text-green-700 border-green-400' : 'bg-red-500/20 text-red-700 border-red-400'}>
                          {user.status}
                          {isCurrentUserLastActiveAdmin && user.status === 'active' && <ShieldAlert className="inline ml-1.5 h-3.5 w-3.5" />}
                        </Badge>
                      </TableCell>
                      <TableCell>
                         <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => confirmStatusChange(user._id, user.status === 'active' ? 'suspended' : 'active')}
                            disabled={updatingUserId === user._id || (isCurrentUserLastActiveAdmin && user.status === 'active')}
                            title={isCurrentUserLastActiveAdmin && user.status === 'active' ? "Cannot suspend the last active admin." : (user.status === 'active' ? "Suspend User" : "Activate User")}
                         >
                            {user.status === 'active' ? <UserX className="mr-1 h-4 w-4" /> : <UserCheck className="mr-1 h-4 w-4" />}
                            {user.status === 'active' ? 'Suspend' : 'Activate'}
                         </Button>
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
            <AlertDialogTitle>Confirm Action</AlertDialogTitle>
            <AlertDialogDescription>
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
        <div className="container text-center text-sm text-muted-foreground">
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
