
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import type { AuditLogEntry } from '@/types';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';

const ITEMS_PER_PAGE = 20;

export default function AdminAuditLogsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);

  const fetchAuditLogs = async (page: number) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/audit-logs?page=${page}&limit=${ITEMS_PER_PAGE}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch audit logs');
      }
      const data = await response.json();
      setAuditLogs(data.auditLogs || []);
      setCurrentPage(data.currentPage || 1);
      setTotalPages(data.totalPages || 1);
      setTotalLogs(data.totalLogs || 0);
    } catch (err: any) {
      setError(err.message);
      setAuditLogs([]);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (!session || session.user.role !== 'admin') {
      router.replace('/auth/signin');
      return;
    }
    fetchAuditLogs(currentPage);
  }, [session, sessionStatus, router, currentPage]);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  if (sessionStatus === 'loading' || (loading && !auditLogs.length && !error)) {
    return (
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-48 mb-1" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-10 w-full mb-2" /> {/* Table Header Skeleton */}
              {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-12 w-full mb-1" />)} {/* Table Row Skeletons */}
              <div className="mt-4 flex justify-between items-center">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-9 w-24" />
              </div>
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
            <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center">
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

  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl sm:text-3xl font-bold font-headline flex items-center">
                <FileText className="mr-3 h-8 w-8 text-primary" />
                Admin Audit Logs
            </CardTitle>
            <CardDescription>Track important administrative actions performed on the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading && auditLogs.length === 0 && <Skeleton className="h-64 w-full" />}
            {error && <p className="text-destructive text-center py-4">Error loading audit logs: {error}</p>}
            {!loading && auditLogs.length === 0 && !error && (
                <p className="text-muted-foreground text-center py-10">No audit logs found.</p>
            )}
            {!loading && auditLogs.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Admin</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Target User</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditLogs.map((log) => (
                        <TableRow key={log._id}>
                          <TableCell>{format(new Date(log.timestamp), 'Pp')}</TableCell>
                          <TableCell>{log.adminUserEmail || 'N/A'}</TableCell>
                          <TableCell>
                              <span className="font-medium">
                                  {log.action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                              </span>
                          </TableCell>
                          <TableCell>{log.targetUserEmail || 'N/A'}</TableCell>
                          <TableCell className="text-xs">
                            {log.details && typeof log.details === 'object' && Object.keys(log.details).length > 0 ? (
                              <pre className="max-w-xs overflow-x-auto bg-muted p-1 rounded-sm">
                                  {JSON.stringify(log.details, null, 2)}
                              </pre>
                            ) : 'No details'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {totalPages > 1 && (
                  <div className="mt-6 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <Button
                      variant="outline"
                      onClick={handlePreviousPage}
                      disabled={currentPage === 1 || loading}
                    >
                      <ChevronLeft className="mr-2 h-4 w-4" /> Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages} (Total: {totalLogs} logs)
                    </span>
                    <Button
                      variant="outline"
                      onClick={handleNextPage}
                      disabled={currentPage === totalPages || loading}
                    >
                      Next <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <footer className="py-6 border-t bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} codexair Admin.
        </div>
      </footer>
    </div>
  );
}
