import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import React from 'react';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>Molam Notifications</title>
        <meta name="description" content="Service de notifications transactionnelles Molam" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        
        {/* Apple-like meta tags */}
        <meta name="theme-color" content="#0066FF" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Molam Notifs" />
        
        {/* Open Graph */}
        <meta property="og:title" content="Molam Notifications" />
        <meta property="og:description" content="Service de notifications transactionnelles Molam" />
        <meta property="og:type" content="website" />
      </Head>
      
      <div className="min-h-screen bg-white">
        <Component {...pageProps} />
      </div>
    </>
  );
}