
'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
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
import { BarChartBig, ChevronDown, LogOut, UserCircle, Settings, GitFork, FileText, Users, Lightbulb, BookCheck, Home, Info, LayoutGrid, Cog, Shield } from 'lucide-react';

export default function Navbar() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  const handleScrollToFeatures = (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
    e.preventDefault();
    if (pathname === '/') {
      const featuresSection = document.getElementById('features');
      if (featuresSection) {
        featuresSection.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      router.push('/#features');
    }
  };

  const isAdmin = session?.user?.role === 'admin';

  if (status === "loading") {
    return (
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChartBig className="h-7 w-7 text-primary" />
            <span className="font-bold text-xl text-foreground font-headline">codexair</span>
          </div>
          <div className="h-10 w-10 bg-muted rounded-full animate-pulse"></div> {/* Skeleton for avatar */}
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
          {pathname === '/' ? (
             <Button asChild variant="ghost">
                <a href="#features" onClick={handleScrollToFeatures}>
                    <LayoutGrid className="mr-2 h-4 w-4" /> Features
                </a>
             </Button>
          ) : (
            <Button asChild variant="ghost">
                <Link href="/features">
                    <LayoutGrid className="mr-2 h-4 w-4" /> Features
                </Link>
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link href="/about">
              <Info className="mr-2 h-4 w-4" /> About Us
            </Link>
          </Button>

          {session && !isAdmin && ( // Only show these for non-admin users
            <>
              <Button asChild variant="ghost">
                <Link href="/dashboard">
                  <BarChartBig className="mr-2 h-4 w-4" /> Dashboard
                </Link>
              </Button>
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
           {session && isAdmin && ( // Admin-specific main nav link
            <Button asChild variant="ghost">
              <Link href="/admin">
                <Shield className="mr-2 h-4 w-4" /> Admin Panel
              </Link>
            </Button>
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
                  <span className="hidden lg:inline text-sm font-medium text-foreground truncate max-w-[150px]">{session.user?.name}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{session.user?.name || 'My Account'}</DropdownMenuLabel>
                {session.user?.email && <DropdownMenuLabel className="text-xs font-normal text-muted-foreground -mt-1.5">{session.user.email}</DropdownMenuLabel>}
                <DropdownMenuSeparator />
                
                {/* Common links for both user and admin for their own account management */}
                <DropdownMenuItem onClick={() => router.push('/profile')}>
                  <UserCircle className="mr-2 h-4 w-4" /> My Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/settings')}>
                  <Cog className="mr-2 h-4 w-4" /> My Settings
                </DropdownMenuItem>


                {isAdmin && ( // Admin-specific links
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Admin Tools</DropdownMenuLabel>
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
                
                {!isAdmin && ( // Non-admin specific links (if any beyond profile/settings are needed here)
                     <>
                        {/* Example: could add quick link to dashboard if not already prominent */}
                        {/* For now, profile/settings cover basic user actions in dropdown for non-admins */}
                     </>
                )}


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

