
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { SecurityHotspotItem } from "@/types";
import { AlertTriangle, FileWarning, CalendarDays } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';

interface SecurityHotspotsProps {
  hotspots: SecurityHotspotItem[];
}

export default function SecurityHotspots({ hotspots }: SecurityHotspotsProps) {
  return (
    <Card className="shadow-lg h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold font-headline flex items-center">
          <FileWarning className="mr-2 h-6 w-6 text-destructive" />
          Security Hotspots
        </CardTitle>
        <CardDescription>Files with the most critical or high-severity security issues.</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        {hotspots.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <AlertTriangle className="w-16 h-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No significant security hotspots identified.</p>
            <p className="text-xs text-muted-foreground mt-1">Keep analyzing your PRs!</p>
          </div>
        ) : (
          <ScrollArea className="h-[320px] pr-3">
            <ul className="space-y-3">
              {hotspots.map((hotspot, index) => (
                <li key={index} className="p-3 border rounded-md hover:bg-muted/50 transition-colors">
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-sm text-foreground truncate pr-2" title={hotspot.filename}>
                      {hotspot.filename}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                        {hotspot.criticalIssues > 0 && <Badge variant="destructive">{hotspot.criticalIssues} Critical</Badge>}
                        {hotspot.highIssues > 0 && <Badge variant="default" className="bg-orange-500 hover:bg-orange-600 text-white">{hotspot.highIssues} High</Badge>}
                    </div>
                  </div>
                  <div className="mt-1.5 text-xs text-muted-foreground flex items-center justify-between">
                     <span>Total Issues in File: {hotspot.totalIssuesInFile}</span>
                     <div className="flex items-center gap-1" title={`Last issue detected in this file: ${new Date(hotspot.lastOccurrence).toLocaleDateString()}`}>
                        <CalendarDays className="h-3 w-3"/>
                        {hotspot.lastOccurrence.getFullYear() > 1 ? formatDistanceToNow(new Date(hotspot.lastOccurrence), { addSuffix: true }) : 'N/A'}
                     </div>
                  </div>
                   <p className="text-xs text-muted-foreground mt-1">
                        Found in {hotspot.relatedPrIds.length} PR(s)
                    </p>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

