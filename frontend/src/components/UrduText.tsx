// RTL wrapper — all Urdu text goes through this
import React from 'react';

interface UrduTextProps {
  children: React.ReactNode;
  className?: string;
}

export function UrduText({ children, className = '' }: UrduTextProps) {
  return (
    <div 
      dir="rtl" 
      className={className} 
      style={{ fontFamily: "'Noto Nastaliq Urdu', serif", lineHeight: 2.1 }}
    >
      {children}
    </div>
  );
}
