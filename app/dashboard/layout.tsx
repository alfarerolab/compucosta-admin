'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NotificationProvider } from '@/context/NotificationContext';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import { CommandMenu } from '@/components/CommandMenu';
import { useChatNotifications } from '@/hooks/useChatNotifications';
import { Toaster } from 'react-hot-toast';
import { Toaster as SonnerToaster } from '@/components/ui/sonner';
import { Toaster as ShadcnToaster } from '@/components/ui/toaster';
import { toast } from 'sonner';

const COLLAPSED_KEY = 'sidebar-collapsed';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { unreadMessages, connectionStatus } = useChatNotifications();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Detectar si es edición de producto exactamente
  const isEditProductPage = /^\/dashboard\/products\/[^\/]+\/edit$/.test(pathname);

  const isEditContactoPage = /^\/dashboard\/contactos\/[^\/]+\/edit$/.test(pathname);
  const isNewContactoPage = pathname === '/dashboard/contactos/new';

  const isChatPage = pathname.startsWith('/dashboard/chat');

  const isNoScroll = isChatPage || isEditProductPage || isEditContactoPage || isNewContactoPage ;

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {}
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => {
      try {
        localStorage.setItem(COLLAPSED_KEY, prev ? '0' : '1');
      } catch {}
      return !prev;
    });
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      setIsLoggingOut(true);
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        try { sessionStorage.removeItem('user'); } catch {}
        toast.success('Sesión cerrada');
        router.push('/login');
      }
    } catch (err) {
      toast.error('Error al cerrar sesión');
    } finally {
      setIsLoggingOut(false);
    }
  }, [router]);

  useEffect(() => {
    if (isNoScroll) {
      // ❌ Solo bloqueamos scroll del body/html, no del contenido interno
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }

    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [isNoScroll]);

  return (
    <NotificationProvider>
      <div className="flex h-screen bg-background">
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          unreadMessages={unreadMessages}
          connectionStatus={connectionStatus}
        />
        <div className="flex flex-1 flex-col min-w-0 min-h-0">
          <Topbar
            onOpenMobile={() => setMobileOpen(true)}
            onOpenSearch={() => setSearchOpen(true)}
            onLogout={handleLogout}
            isLoggingOut={isLoggingOut}
            unreadMessages={unreadMessages}
          />
          <main
            className={`flex-1 flex flex-col min-h-0 min-w-0 ${
              isNoScroll ? 'overflow-y-auto p-0' : 'overflow-y-auto scrollbar-thin p-4 sm:p-6 lg:p-8'
            }`}
          >
            {isNoScroll ? children : (
              <div className="w-full max-w-screen-2xl mx-auto animate-in fade-in-0 duration-300">{children}</div>
            )}
          </main>
        </div>
        <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} onLogout={handleLogout} />
        {/* La app usa tres librerías de toasts; cada una necesita su propio contenedor montado */}
        <Toaster position="top-right" toastOptions={{ className: 'text-sm', style: { borderRadius: '10px' } }} />
        <SonnerToaster theme="light" position="top-right" richColors closeButton />
        <ShadcnToaster />
      </div>
    </NotificationProvider>
  );
}
