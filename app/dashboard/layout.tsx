'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { NotificationProvider } from '@/context/NotificationContext';
import Sidebar from '@/components/Sidebar'; 
import { Toaster } from 'react-hot-toast'; 


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Detectar si es edición de producto exactamente
  const isEditProductPage = /^\/dashboard\/products\/[^\/]+\/edit$/.test(pathname);

  const isEditContactoPage = /^\/dashboard\/contactos\/[^\/]+\/edit$/.test(pathname);
  const isNewContactoPage = pathname === '/dashboard/contactos/new';
  
  const isChatPage = pathname.startsWith('/dashboard/chat');

  const isNoScroll = isChatPage || isEditProductPage || isEditContactoPage || isNewContactoPage ;

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
      <div className="flex h-screen">
        <Sidebar />
        <main
          className={`flex-1 bg-gray-50 flex flex-col min-h-0 ${
            isNoScroll ? 'overflow-y-auto p-0' : 'overflow-y-auto p-8'
          }`}
        >
          {children}
        </main>
        <Toaster />
      </div>
    </NotificationProvider>
  );
}
