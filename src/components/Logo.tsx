import React from 'react';

export default function Logo({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <img 
      src="/logo.png" 
      alt="MBI Logo" 
      className={className}
      crossOrigin="anonymous"
      onError={(e) => {
        // Fallback if image is missing
        e.currentTarget.src = 'https://placehold.co/400x400/3b82f6/ffffff?text=MBI';
      }}
    />
  );
}
