import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import type { ReactNode } from 'react';

import Navbar from '@/components/Navbar';
import Footer from '@/components/layout/Footer';
import MobileBottomNav from '@/components/layout/MobileBottomNav';
import RouteLoadingBar from '@/components/layout/RouteLoadingBar';
import SkipLink from '@/components/layout/SkipLink';
import SupportChatHost from '@/components/support/SupportChatHost';
import { AuthProvider } from '@/context/AuthContext';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'BidKori',
  description: 'Real-time online auction marketplace',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <RouteLoadingBar />
          <SkipLink />
          <Navbar />
          <div id="main-content" tabIndex={-1} className="flex-1 flex flex-col outline-none">
            {children}
          </div>
          <Footer />
          <MobileBottomNav />
          <SupportChatHost />
          <Toaster position="top-right" />
        </AuthProvider>
      </body>
    </html>
  );
}
