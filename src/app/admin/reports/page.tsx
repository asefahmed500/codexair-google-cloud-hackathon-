
'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/layout/navbar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Eye, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { AnalysisReportItem } from '@/types';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge'; // Import Badge

export default function AdminReportsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [reportData, setReportData] = useState<AnalysisReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session || session.user.role !== 'admin') {
      router.replace('/auth/signin');
      return;
    }

    async function fetchReportData() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/admin/reports/analysis-summary');
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to fetch report data');
        }
        const data = await response.json();
        setReportData(data.reportItems || []);
      } catch (err: any) {
        setError(err.message);
        setReportData([]);
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }

    if (session && session.user.role === 'admin') {
      fetchReportData();
    }
  }, [session, status, router]);

  const handleDownloadCSV = () => {
    if (reportData.length === 0) {
        toast({title: "No Data", description: "No data to export.", variant: "default"});
        return;
    }
    const headers = ["PR Number", "PR Title", "Repository", "Author", "Analysis Date", "Quality Score", "Critical Issues", "High Issues", "Analysis Link"];
    const rows = reportData.map(item => {
        const analysisLink = item.analysisId && item.repositoryFullName !== 'N/A' && item.repositoryFullName.includes('/')
            ? `${window.location.origin}/analyze/${item.repositoryFullName}/${item.prNumber}/${item.analysisId}`
            : 'N/A';
        return [
            item.prNumber,
            `"${item.prTitle.replace(/"/g, '""')}"`, 
            item.repositoryFullName,
            item.prAuthor,
            format(new Date(item.analysisDate), 'yyyy-MM-dd HH:mm'),
            item.qualityScore ?? 'N/A',
            item.criticalIssuesCount,
            item.highIssuesCount,
            analysisLink
        ];
    });

    const csvContent = "data:text/csv;charset=utf-8,"
        + headers.join(",") + "\n"
        + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `analysis_summary_report_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({title: "CSV Exported", description: "Analysis summary report downloaded.", variant: "default"});
  };

  const getQualityScoreColor = (score: number | null) => {
    if (score === null || score === undefined) return 'text-muted-foreground';
    if (score >= 7) return 'text-green-600';
    if (score >= 4) return 'text-amber-600';
    return 'text-destructive';
  };


  if (status === 'loading' || (loading && !reportData.length && !error)) {
    return (
      <div className="flex flex-col min-h-screen bg-secondary/50">
        <Navbar />
        <main className="flex-1 container py-8">
          <Card className="shadow-lg">
            <CardHeader>
              <Skeleton className="h-8 w-56 mb-1" />
              <Skeleton className="h-4 w-72" />
            </CardHeader>
            <CardContent>
              <div className="flex justify-end mb-4">
                <Skeleton className="h-10 w-32" />
              </div>
              <Skeleton className="h-10 w-full mb-2" /> {/* Table Header Skeleton */}
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full mb-1" />)} {/* Table Row Skeletons */}
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
        <div className="flex flex-col min-h-screen bg-secondary/50">
            <Navbar />
            <main className="flex-1 container py-8">
                <Card className="text-center shadow-lg">
                    <CardHeader><CardTitle className="text-destructive">Error Loading Report</CardTitle></CardHeader>
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <CardTitle className="text-2xl sm:text-3xl font-bold font-headline">Analysis Summary Report</CardTitle>
                    <CardDescription>Overview of all analyzed pull requests in the system.</CardDescription>
                </div>
                <Button onClick={handleDownloadCSV} disabled={reportData.length === 0 || loading} className="mt-4 sm:mt-0">
                    <Download className="mr-2 h-4 w-4" />
                    Download CSV
                </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading && reportData.length === 0 && (
              <div className="space-y-2 mt-4">
                  <Skeleton className="h-10 w-full" />
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            )}
            {!loading && reportData.length === 0 && !error && (
                <p className="text-muted-foreground text-center py-10">No analyzed pull requests found to report.</p>
            )}
            {!loading && reportData.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">PR</TableHead>
                  <TableHead>Repository</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Analysis Date</TableHead>
                  <TableHead className="text-center">Quality</TableHead>
                  <TableHead className="text-center">Crit. Issues</TableHead>
                  <TableHead className="text-center">High Issues</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.map((item) => (
                  <TableRow key={item.prId}>
                    <TableCell className="font-medium">
                        {item.analysisId && item.repositoryFullName !== 'N/A' && item.repositoryFullName.includes('/') ? (
                             <Link href={`/analyze/${item.repositoryFullName}/${item.prNumber}/${item.analysisId}`} 
                                  className="hover:underline text-primary"
                                  title={item.prTitle}>
                                #{item.prNumber}: {item.prTitle.substring(0, 30)}{item.prTitle.length > 30 ? '...' : ''}
                            </Link>
                        ) : (
                            <span title={item.prTitle}>
                                #{item.prNumber}: {item.prTitle.substring(0, 30)}{item.prTitle.length > 30 ? '...' : ''}
                            </span>
                        )}
                    </TableCell>
                    <TableCell>{item.repositoryFullName}</TableCell>
                    <TableCell>{item.prAuthor}</TableCell>
                    <TableCell>{format(new Date(item.analysisDate), 'MMM d, yyyy')}</TableCell>
                    <TableCell className={`text-center font-semibold ${getQualityScoreColor(item.qualityScore)}`}>
                      {item.qualityScore !== null ? item.qualityScore.toFixed(1) : <span className="text-muted-foreground">N/A</span>}
                    </TableCell>
                    <TableCell className={`text-center font-semibold ${item.criticalIssuesCount > 0 ? 'text-destructive' : 'text-green-600'}`}>
                      {item.criticalIssuesCount > 0 && <AlertTriangle className="inline h-4 w-4 mr-1" />}
                      {item.criticalIssuesCount === 0 && <CheckCircle2 className="inline h-4 w-4 mr-1" />}
                      {item.criticalIssuesCount}
                    </TableCell>
                     <TableCell className={`text-center font-semibold ${item.highIssuesCount > 0 ? 'text-orange-500' : 'text-green-600'}`}>
                      {item.highIssuesCount > 0 && <AlertTriangle className="inline h-4 w-4 mr-1" />}
                      {item.highIssuesCount === 0 && <CheckCircle2 className="inline h-4 w-4 mr-1" />}
                      {item.highIssuesCount}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.analysisId && item.repositoryFullName !== 'N/A' && item.repositoryFullName.includes('/') && (
                        <Button variant="ghost" size="sm" asChild>
                           <Link href={`/analyze/${item.repositoryFullName}/${item.prNumber}/${item.analysisId}`}>
                                <Eye className="mr-1 h-4 w-4" /> View
                           </Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            )}
          </CardContent>
        </Card>
      </main>
      <footer className="py-6 border-t bg-background">
        <div className="container text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} codexair Admin Reports.
        </div>
      </footer>
    </div>
  );
}

    

    
