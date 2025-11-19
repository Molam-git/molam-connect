/**
 * Scroll to Top Button Component
 * Always accessible, appears after scrolling 200px
 * Apple-like design with smooth scroll
 */
import React, { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { useUIConfig } from '../hooks/useUIConfig';

interface ScrollToTopButtonProps {
  className?: string;
  showAfterScroll?: number;
}

export function ScrollToTopButton({
  className = '',
  showAfterScroll = 200
}: ScrollToTopButtonProps) {
  const [isVisible, setIsVisible] = useState(false);
  const config = useUIConfig();

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      setIsVisible(scrollTop > showAfterScroll);
    };

    // Check initial scroll position
    handleScroll();

    // Add scroll listener
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [showAfterScroll]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      scrollToTop();
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <button
      onClick={scrollToTop}
      onKeyDown={handleKeyDown}
      className={`
        fixed bottom-6 right-6 z-40
        w-12 h-12
        flex items-center justify-center
        bg-white text-gray-700
        shadow-lg hover:shadow-xl
        rounded-full
        transition-all duration-300 ease-in-out
        hover:scale-110
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
        border border-gray-200
        ${className}
      `}
      aria-label="Retour en haut de la page"
      title="Retour en haut"
      style={{
        backgroundColor: config.accessibility.highContrast ? '#000' : undefined,
        color: config.accessibility.highContrast ? '#fff' : undefined
      }}
    >
      <ArrowUp className="w-6 h-6" />
    </button>
  );
}

export default ScrollToTopButton;
