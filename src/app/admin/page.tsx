
'use client';

import React, { useEffect, useState, type ChangeEvent, useCallback } from 'react'; 
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
import type { AdminUserView, AuditLogActionType } from '@/types';
import type { AdminSummaryStats } from '@/app/api/admin/summary-stats/route';
import type { BusFactorAlert } from '@/app/api/admin/bus-factor-alerts/route';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { ShieldAlert, Users, FolderGit2, FileScan, UserCheck, UserX, FileSliders, AlertTriangle, ShieldCheckIcon as ShieldCheckIconActive, UserFocus, Settings as SettingsIcon } from 'lucide-react';

interface UserTableRowProps {
  user: AdminUserView;
  currentSessionUserId: string | undefined;
  adminCount: number;
  activeAdminCount: number;
  updatingUserId: string | null;
  onRoleChange: (userId: string, newRole: 'user' | 'admin') => void;
  onStatusChange: (userId: string, newStatus: 'active' | 'suspended') => void;
}

const UserTableRow = React.memo(function UserTableRow({
  user,
  currentSessionUserId,
  adminCount,
  activeAdminCount,
  updatingUserId,
  onRoleChange,
  onStatusChange,
}: UserTableRowProps) {
  const isCurrentUser = currentSessionUserId === user._id;
  
  const isLastAdmin = user.role === 'admin' && adminCount <= 1;
  const isLastActiveAdmin = user.role === 'admin' && user.status === 'active' && activeAdminCount <= 1;

  const disableRoleChange = 
    updatingUserId === user._id || 
    (isCurrentUser && isLastAdmin); 
  const roleChangeTitle = (isCurrentUser && isLastAdmin) ? "Cannot change your own role as the last admin." : "";

  const disableStatusChange = 
    updatingUserId === user._id || 
    (isCurrentUser && isLastActiveAdmin && user.status === 'active'); 
  const statusChangeTitle = (isCurrentUser && isLastActiveAdmin && user.status === 'active') 
    ? "Cannot suspend your own account as the last active admin." 
    : (user.status === 'active' ? `Suspend user ${user.email}` : `Activate user ${user.email}`);

  return (
    <TableRow key={user._id} className={updatingUserId === user._id ? 'opacity-50' : ''}>
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
            <SelectItem value="admin" disabled={isLastAdmin && user.role === 'admin' && !isCurrentUser}>
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

  const [busFactorAlerts, setBusFactorAlerts] = useState<BusFactorAlert[]>([]);
  const [loadingBusFactorAlerts, setLoadingBusFactorAlerts] = useState(true);
  const [errorBusFactorAlerts, setErrorBusFactorAlerts] = useState<string | null>(null);

  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertAction, setAlertAction] = useState<{ userId: string; newRole?: 'user' | 'admin'; newStatus?: 'active' | 'suspended', actionType: 'role' | 'status' } | null>(null);

  const [adminCount, setAdminCount] = useState(0);
  const [activeAdminCount, setActiveAdminCount] = useState(0);

  const [isEmergencyPolicyActive, setIsEmergencyPolicyActive] = useState(false);
  const [loadingPolicy, setLoadingPolicy] = useState(true);
  const [togglingPolicy, setTogglingPolicy] = useState(false);

  const updateAdminCounts = useCallback((currentUsers: AdminUserView[]) => {
    setAdminCount(currentUsers.filter(u => u.role === 'admin').length);
    setActiveAdminCount(currentUsers.filter(u => u.role === 'admin' && u.status === 'active').length);
  }, []);

  const fetchEmergencyPolicyStatus = useCallback(async () => {
    setLoadingPolicy(true);
    try {
        const response = await fetch('/api/settings/emergency-policy');
        if (!response.ok) throw new Error('Failed to fetch emergency policy status');
        const data = await response.json();
        setIsEmergencyPolicyActive(data.enabled);
    } catch (err: any) {
        toast({ title: "Policy Status Error", description: `Could not load emergency policy status: ${err.message}`, variant: "destructive" });
        setIsEmergencyPolicyActive(false); // Default to false on error
    } finally {
        setLoadingPolicy(false);
    }
  }, []);


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
        toast({ title: "Error Fetching Stats", description: err.message, variant: "destructive"});
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
        toast({ title: "Error Fetching Users", description: err.message, variant: "destructive"});
      } finally {
        setLoadingUsers(false);
      }

      setLoadingBusFactorAlerts(true);
      setErrorBusFactorAlerts(null);
      try {
        const busFactorResponse = await fetch('/api/admin/bus-factor-alerts');
        if (!busFactorResponse.ok) {
          const errorData = await busFactorResponse.json();
          throw new Error(errorData.error || 'Failed to fetch bus factor alerts');
        }
        const busFactorData = await busFactorResponse.json();
        setBusFactorAlerts(busFactorData.alerts || []);
      } catch (err: any) {
        setErrorBusFactorAlerts(err.message);
        setBusFactorAlerts([]);
        toast({ title: "Error Fetching Bus Factor Alerts", description: err.message, variant: "destructive"});
      } finally {
        setLoadingBusFactorAlerts(false);
      }
      
      fetchEmergencyPolicyStatus();
    }

    if (session && session.user.role === 'admin') {
      fetchAdminData();
    }
  }, [session, sessionStatus, router, updateAdminCounts, fetchEmergencyPolicyStatus]);

  const confirmRoleChange = (userId: string, newRole: 'user' | 'admin') => {
    const userToUpdate = users.find(u => u._id === userId);
    if (!userToUpdate) return;

    if (userToUpdate.role === newRole) {
        toast({ title: "No Change", description: "The selected role is the same as the current role.", variant: "default"});
        return;
    }
    
    if (session?.user?.id === userId && userToUpdate.role === 'admin' && newRole === 'user' && adminCount <= 1) {
        toast({ title: "Action Prohibited", description: "You cannot change your own role as the last admin. The system requires at least one admin.", variant: "destructive"});
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

    if (session?.user?.id === userId && userToUpdate.role === 'admin' && userToUpdate.status === 'active' && newStatus === 'suspended' && activeAdminCount <= 1) {
        toast({ title: "Action Prohibited", description: "You cannot suspend your own account as the last active admin. The system requires at least one active admin.", variant: "destructive"});
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
        updateAdminCounts(updatedUsers); 
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

  const handleToggleEmergencyPolicy = async () => {
    setTogglingPolicy(true);
    const newPolicyEnabledState = !isEmergencyPolicyActive;
    
    try {
      const response = await fetch('/api/admin/settings/emergency-policy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newPolicyEnabledState }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update emergency policy');
      }
      
      setIsEmergencyPolicyActive(result.newStatus);
      toast({
        title: `Emergency Policy ${result.newStatus ? 'Activated' : 'Deactivated'}`,
        description: result.newStatus
          ? "SIMULATED: Merging of PRs with Critical security issues is now BLOCKED. Team leads would be notified."
          : "SIMULATED: Emergency policy is INACTIVE. Standard PR merging rules apply.",
        variant: result.newStatus ? "destructive" : "default",
        duration: 7000,
      });

    } catch (err: any) {
      toast({ title: "Policy Change Error", description: `Failed to update policy status: ${err.message}`, variant: "destructive" });
    } finally {
      setTogglingPolicy(false);
    }
  };


  if (sessionStatus === 'loading' || (loadingUsers && !users.length && !errorUsers && loadingStats && !summaryStats && !errorStats && loadingBusFactorAlerts && loadingPolicy )) {
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
              <Skeleton className="h-32 w-full mb-6" /> {/* Emergency Policy Skeleton */}
              <Skeleton className="h-32 w-full mb-6" /> {/* Bus Factor Skeleton */}
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
          description += `\n\n⚠️ WARNING: This is the last admin account. Demoting this user will result in NO ADMINS on the system. This action is extremely dangerous and may require database intervention to fix if you proceed. The system will attempt to prevent this.`;
        } else if (session?.user?.id === userId) {
          description += `\n\nWarning: You are about to change your own role. You will lose admin privileges.`;
        }
      }
    } else if (actionType === 'status') {
      description = `Are you sure you want to change ${userToUpdate.email}'s status to ${newStatus}?`;
      if (newStatus === 'suspended' && userToUpdate.role === 'admin' && userToUpdate.status === 'active') {
        if (activeAdminCount <= 1) {
         description += `\n\n⚠️ WARNING: This is the last active admin account. Suspending this user may lock out all admin functionality if no other admin can re-activate accounts. The system will attempt to prevent this.`;
        } else if (session?.user?.id === userId) {
          description += `\n\nWarning: You are about to suspend your own account. You will be logged out and lose admin access.`;
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
            <CardDescription>Manage users, roles, status, view platform statistics, and control emergency policies.</CardDescription>
          </CardHeader>
          <CardContent>
            <h2 className="text-xl font-semibold mb-4 text-foreground">Platform Overview</h2>
            {loadingStats && <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-28 w-full" />
              </div>}
            {errorStats && <p className="text-destructive mb-4">Error loading platform stats: {errorStats}</p>}
            {summaryStats && !loadingStats && (
              <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                <StatCard Icon={Users} title="Total Users" value={summaryStats.totalUsers} />
                <StatCard Icon={FolderGit2} title="Total Repositories Synced" value={summaryStats.totalRepositories} description="Across all users" />
                <StatCard Icon={FileScan} title="Total Analyses" value={summaryStats.totalAnalyses} description="PRs & Full Scans" />
                {summaryStats.topTimeWaster ? (
                  <StatCard 
                    Icon={FileSliders} 
                    title="Top Improvement Area" 
                    value={summaryStats.topTimeWaster.type} 
                    description={`Est. ${summaryStats.topTimeWaster.estimatedHours} total hrs across ${summaryStats.topTimeWaster.occurrences} occurrences`} 
                  />
                ) : (
                  <StatCard Icon={FileSliders} title="Top Improvement Area" value="N/A" description="No suggestion data yet" />
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg mb-8">
          <CardHeader>
            <h2 className="text-xl font-semibold text-foreground flex items-center">
              <SettingsIcon className="h-6 w-6 mr-2 text-primary" /> {/* Changed Icon */}
              Emergency Controls
            </h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Activate the emergency policy to SIMULATE blocking merges of Pull Requests with critical security vulnerabilities and SIMULATE notifying team leads. 
              This state is now persistent across the platform.
            </p>
             {loadingPolicy ? <Skeleton className="h-10 w-64" /> : (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Button
                    onClick={handleToggleEmergencyPolicy}
                    variant={isEmergencyPolicyActive ? "destructive" : "default"}
                    disabled={togglingPolicy}
                    className="w-full sm:w-auto"
                >
                    {togglingPolicy ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> 
                    ) : isEmergencyPolicyActive ? (
                    <ShieldCheckIconActive className="mr-2 h-4 w-4" />
                    ) : (
                    <ShieldAlert className="mr-2 h-4 w-4" />
                    )}
                    {togglingPolicy 
                        ? (isEmergencyPolicyActive ? "Deactivating..." : "Activating...") 
                        : (isEmergencyPolicyActive ? "Deactivate Emergency Policy" : "Activate Emergency Policy")}
                </Button>
                <Badge variant={isEmergencyPolicyActive ? "destructive" : "secondary"} className="text-sm py-1.5 px-3">
                    Current Policy Status: {isEmergencyPolicyActive ? "ACTIVE (Simulated Blocking)" : "INACTIVE (Normal Operations)"}
                </Badge>
                </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-lg mb-8">
          <CardHeader>
            <h2 className="text-xl font-semibold text-foreground flex items-center">
              <UserFocus className="h-6 w-6 mr-2 text-accent" />
              Knowledge Concentration Risks
            </h2>
            <CardDescription>
              Repositories where a single author is associated with a high percentage of analyzed PRs (over 70% for repos with at least 3 analyses).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingBusFactorAlerts && <Skeleton className="h-32 w-full" />}
            {errorBusFactorAlerts && <p className="text-destructive">Error loading knowledge concentration risks: {errorBusFactorAlerts}</p>}
            {!loadingBusFactorAlerts && busFactorAlerts.length === 0 && !errorBusFactorAlerts && (
              <p className="text-muted-foreground">No significant knowledge concentration risks detected based on current analysis data.</p>
            )}
            {!loadingBusFactorAlerts && busFactorAlerts.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Repository</TableHead>
                      <TableHead>Dominant Author</TableHead>
                      <TableHead className="text-center">Author's PRs</TableHead>
                      <TableHead className="text-center">Total Repo PRs</TableHead>
                      <TableHead className="text-center">Concentration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {busFactorAlerts.map((alert, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{alert.repoFullName}</TableCell>
                        <TableCell>{alert.dominantAuthor}</TableCell>
                        <TableCell className="text-center">{alert.authorAnalysesCount}</TableCell>
                        <TableCell className="text-center">{alert.totalRepoAnalyses}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="destructive">{alert.percentage.toFixed(1)}%</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                      currentSessionUserId={session?.user?.id}
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
            <AlertDialogAction 
                onClick={handleUpdate} 
                disabled={updatingUserId === alertAction?.userId}
                className={
                    alertAction &&
                    ((alertAction.actionType === 'role' && alertAction.newRole === 'user' && users.find(u => u._id === alertAction.userId)?.role === 'admin' && adminCount <=1 ) ||
                     (alertAction.actionType === 'status' && alertAction.newStatus === 'suspended' && users.find(u => u._id === alertAction.userId)?.role === 'admin' && users.find(u => u._id === alertAction.userId)?.status === 'active' && activeAdminCount <=1 ))
                    ? 'bg-destructive hover:bg-destructive/90'
                    : ''
                }
            >
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
    
