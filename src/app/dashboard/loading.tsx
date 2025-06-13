
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Navbar from "@/components/layout/navbar";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col min-h-screen bg-secondary/50">
      <Navbar />
      <main className="flex-1 container py-8">
        <Skeleton className="h-9 w-48 mb-8" /> {/* Dashboard Title Skeleton */}

        {/* Analytics Overview Skeleton */}
        <Card className="mb-6">
          <CardHeader>
            <Skeleton className="h-6 w-1/3 mb-2" />
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-2/3" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-1/2" />
                  <Skeleton className="h-3 w-1/3 mt-1" />
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          {/* Recent Reviews Skeleton */}
          <Card className="h-[400px]">
            <CardHeader>
              <Skeleton className="h-6 w-1/2 mb-2" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-md border">
                  <div>
                    <Skeleton className="h-5 w-32 mb-1" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Quality Trends Skeleton */}
          <Card className="h-[400px]">
            <CardHeader>
              <Skeleton className="h-6 w-1/2 mb-2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" /> {/* Chart Skeleton */}
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-6">
            {/* Top Issues (Security/Suggestions) Skeleton */}
            {[...Array(2)].map((_, i) => (
                 <Card key={`top-issues-${i}`} className="h-[350px]">
                    <CardHeader><Skeleton className="h-6 w-1/2 mb-2" /></CardHeader>
                    <CardContent className="space-y-3">
                        {[...Array(3)].map((_, j) => (
                            <div key={j} className="p-3 border rounded-md">
                                <Skeleton className="h-4 w-3/4 mb-1" />
                                <Skeleton className="h-3 w-1/4" />
                            </div>
                        ))}
                    </CardContent>
                </Card>
            ))}
        </div>
         <div className="grid md:grid-cols-2 gap-6">
            {/* Security Hotspots & Team Metrics Skeleton */}
             {[...Array(2)].map((_, i) => (
                 <Card key={`extra-metrics-${i}`} className="h-[350px]">
                    <CardHeader><Skeleton className="h-6 w-1/2 mb-2" /></CardHeader>
                     <CardContent className="space-y-3">
                        {[...Array(3)].map((_, j) => (
                            <div key={j} className="p-3 border rounded-md">
                                <Skeleton className="h-4 w-full mb-1" />
                                <Skeleton className="h-3 w-1/2" />
                            </div>
                        ))}
                    </CardContent>
                </Card>
            ))}
        </div>
      </main>
      <footer className="py-6 border-t bg-background">
        <div className="container text-center text-sm text-muted-foreground">
            <Skeleton className="h-4 w-1/3 mx-auto" />
        </div>
      </footer>
    </div>
  );
}


