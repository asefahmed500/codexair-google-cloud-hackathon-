
'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BarChartBig, ChevronDown, LogOut, UserCircle, Settings, GitFork, FileText, Users, Lightbulb, BookCheck } from 'lucide-react';

export default function Navbar() {
  const { data: session, status } = useSession();
  const router = useRouter();

  if (status === "loading") {
    return (
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChartBig className="h-7 w-7 text-primary" />
            <span className="font-bold text-xl text-foreground font-headline">codexair</span>
          </div>
          <div className="h-10 w-10 bg-muted rounded-full animate-pulse"></div> {/* Placeholder for avatar */}
        </div>
      </header>
    );
  }

  // Minimal Navbar for unauthenticated users (e.g., on the homepage)
  if (!session) {
     return (
       <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <BarChartBig className="h-7 w-7 text-primary" />
            <span className="font-bold text-xl text-foreground font-headline">codexair</span>
          </Link>
          {/* Optionally, add a "Login" button here if desired for homepage */}
           <Button variant="outline" onClick={() => router.push('/auth/signin')}>
            Sign In / Sign Up
          </Button>
        </div>
      </header>
     );
  }

  // Full Navbar for authenticated users
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <BarChartBig className="h-7 w-7 text-primary" />
          <span className="font-bold text-xl text-foreground font-headline">codexair</span>
        </Link>
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" className="text-foreground hover:bg-accent/10">
            <Link href="/explain">
              <Lightbulb className="mr-2 h-4 w-4" />
              Explain Code
            </Link>
          </Button>
          <Button asChild variant="ghost" className="text-foreground hover:bg-accent/10">
            <Link href="/analyze">
              <GitFork className="mr-2 h-4 w-4" />
              Analyze Repository
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2 py-1 h-auto">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={session.user?.image || undefined} alt={session.user?.name || 'User'} />
                  <AvatarFallback>{session.user?.name?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
                </Avatar>
                <span className="hidden md:inline text-sm font-medium text-foreground">{session.user?.name}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{session.user?.name || 'My Account'}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/dashboard')}>
                <BarChartBig className="mr-2 h-4 w-4" /> Dashboard
              </DropdownMenuItem>
              
              {session.user.role === 'admin' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Admin</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => router.push('/admin')}>
                    <Users className="mr-2 h-4 w-4" /> User Management
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/admin/reports')}>
                    <FileText className="mr-2 h-4 w-4" /> Reports
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push('/admin/audit')}>
                    <BookCheck className="mr-2 h-4 w-4" /> Audit Logs
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <UserCircle className="mr-2 h-4 w-4" />
                <span>Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/' })}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
