
'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation'; // Import usePathname
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
import { BarChartBig, ChevronDown, LogOut, UserCircle, Settings, GitFork, FileText, Users, Lightbulb, BookCheck, Home, Info, LayoutGrid } from 'lucide-react';

export default function Navbar() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname(); // Get current path

  const handleScrollToFeatures = (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
    if (pathname === '/') {
      e.preventDefault();
      const featuresSection = document.getElementById('features');
      if (featuresSection) {
        featuresSection.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      // If not on homepage, just navigate to homepage then scroll.
      router.push('/#features');
    }
  };

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

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        <Link href="/" className="flex items-center gap-2 mr-6">
          <BarChartBig className="h-7 w-7 text-primary" />
          <span className="font-bold text-xl text-foreground font-headline">codexair</span>
        </Link>

        <nav className="hidden md:flex items-center space-x-1">
          <Button asChild variant="ghost">
            <Link href="/">
              <Home className="mr-2 h-4 w-4" /> Home
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/features">
              <LayoutGrid className="mr-2 h-4 w-4" /> Features
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/about">
              <Info className="mr-2 h-4 w-4" /> About Us
            </Link>
          </Button>

          {session && (
            <>
              <Button asChild variant="ghost">
                <Link href="/explain">
                  <Lightbulb className="mr-2 h-4 w-4" />
                  Explain Code
                </Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/analyze">
                  <GitFork className="mr-2 h-4 w-4" />
                  Analyze Repository
                </Link>
              </Button>
            </>
          )}
        </nav>

        <div className="flex flex-1 items-center justify-end space-x-4">
          {!session ? (
            <Button onClick={() => router.push('/auth/signin')} variant="default">
              Sign In / Sign Up
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2 py-1 h-auto">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={session.user?.image || undefined} alt={session.user?.name || 'User'} />
                    <AvatarFallback>{session.user?.name?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
                  </Avatar>
                  <span className="hidden lg:inline text-sm font-medium text-foreground">{session.user?.name}</span>
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
          )}
        </div>
      </div>
    </header>
  );
}
