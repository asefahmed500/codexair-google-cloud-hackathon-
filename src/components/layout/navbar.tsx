
'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { usePathname, useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BarChartBig, ChevronDown, LogOut, UserCircle, Settings, GitFork, FileText, Users, Lightbulb, BookCheck, Home, Info, LayoutGrid, Cog, Shield, SearchCode, Menu } from 'lucide-react';

interface NavItem {
  key: string;
  href?: string;
  text: string;
  icon: JSX.Element;
  onClick?: (event?: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => void;
  isAnchor?: boolean;
  show: () => boolean; // Function to determine if the link should be shown
}

export default function Navbar() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLinkClick = () => {
    setIsMobileMenuOpen(false);
  };

  const handleScrollToFeatures = (e?: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
    if (e) e.preventDefault();
    if (pathname === '/') {
      const featuresSection = document.getElementById('features');
      if (featuresSection) {
        featuresSection.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      router.push('/#features');
    }
    setIsMobileMenuOpen(false);
  };

  const isAdmin = session?.user?.role === 'admin';

  const navItems: NavItem[] = [
    { key: 'home', href: '/', text: 'Home', icon: <Home className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => true },
    pathname === '/'
      ? { key: 'features-anchor', href: '#features', text: 'Features', icon: <LayoutGrid className="mr-2 h-4 w-4" />, onClick: handleScrollToFeatures, isAnchor: true, show: () => true }
      : { key: 'features-link', href: '/features', text: 'Features', icon: <LayoutGrid className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => true },
    { key: 'about', href: '/about', text: 'About Us', icon: <Info className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => true },
    { key: 'dashboard', href: '/dashboard', text: 'Dashboard', icon: <BarChartBig className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => !!session && !isAdmin },
    { key: 'explain', href: '/explain', text: 'Explain Code', icon: <Lightbulb className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => !!session && !isAdmin },
    { key: 'analyze', href: '/analyze', text: 'Analyze Repository', icon: <GitFork className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => !!session && !isAdmin },
    { key: 'search', href: '/search', text: 'Semantic Search', icon: <SearchCode className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => !!session && !isAdmin },
    { key: 'admin', href: '/admin', text: 'Admin Panel', icon: <Shield className="mr-2 h-4 w-4" />, onClick: handleLinkClick, show: () => !!session && isAdmin },
  ];

  const renderNavItem = (item: NavItem, isMobile: boolean) => {
    const button = (
      <Button asChild variant="ghost" onClick={item.onClick as React.MouseEventHandler<HTMLButtonElement>}>
        {item.href && !item.isAnchor ? (
          <Link href={item.href}>
            {item.icon} {item.text}
          </Link>
        ) : (
          <a href={item.isAnchor ? item.href : undefined} onClick={item.onClick}>
            {item.icon} {item.text}
          </a>
        )}
      </Button>
    );
    if (isMobile) {
      return <SheetClose asChild key={item.key}>{button}</SheetClose>;
    }
    return React.cloneElement(button, { key: item.key });
  };


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
        <Link href="/" className="flex items-center gap-2 mr-auto md:mr-6">
          <BarChartBig className="h-7 w-7 text-primary" />
          <span className="font-bold text-xl text-foreground font-headline">codexair</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center space-x-1">
          {navItems.filter(item => item.show()).map(item => renderNavItem(item, false))}
        </nav>

        <div className="flex items-center justify-end space-x-2 md:space-x-4 ml-auto md:ml-0">
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
                
                <DropdownMenuItem onClick={() => { router.push('/profile'); handleLinkClick(); }}>
                  <UserCircle className="mr-2 h-4 w-4" /> My Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { router.push('/settings'); handleLinkClick(); }}>
                  <Cog className="mr-2 h-4 w-4" /> My Settings
                </DropdownMenuItem>

                {isAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Admin Tools</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => { router.push('/admin'); handleLinkClick(); }}>
                      <Users className="mr-2 h-4 w-4" /> User Management
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { router.push('/admin/reports'); handleLinkClick(); }}>
                      <FileText className="mr-2 h-4 w-4" /> Reports
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { router.push('/admin/audit'); handleLinkClick(); }}>
                      <BookCheck className="mr-2 h-4 w-4" /> Audit Logs
                    </DropdownMenuItem>
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

          {/* Mobile Navigation Trigger */}
          <div className="md:hidden">
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                  <span className="sr-only">Toggle navigation menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] sm:w-[320px] pt-10">
                <nav className="flex flex-col space-y-2">
                  <SheetClose asChild>
                    <Link href="/" className="flex items-center gap-2 mb-6 px-2" onClick={handleLinkClick}>
                      <BarChartBig className="h-7 w-7 text-primary" />
                      <span className="font-bold text-xl text-foreground font-headline">codexair</span>
                    </Link>
                  </SheetClose>
                  {navItems.filter(item => item.show()).map(item => renderNavItem(item, true))}
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
