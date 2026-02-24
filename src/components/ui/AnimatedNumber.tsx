/**
 * AnimatedNumber - Animated number display with spring animation
 * 
 * Features:
 * - Smooth spring animation when value changes
 * - Customizable format (decimal places, suffix)
 * - Lightweight, no external dependencies
 */

import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  duration?: number; // Animation duration in ms
  decimals?: number; // Decimal places
  suffix?: string; // e.g., " mm"
  className?: string;
}

export function AnimatedNumber({ 
  value, 
  duration = 300, 
  decimals = 0, 
  suffix = '',
  className = ''
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValue = useRef(value);
  const animationRef = useRef<number | null>(null);
  
  useEffect(() => {
    const startValue = previousValue.current;
    const endValue = value;
    const startTime = performance.now();
    
    // Cancel previous animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out cubic for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      const currentValue = startValue + (endValue - startValue) * easeOut;
      setDisplayValue(currentValue);
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        previousValue.current = endValue;
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration]);
  
  const formattedValue = decimals > 0 
    ? displayValue.toFixed(decimals) 
    : Math.round(displayValue).toString();
  
  return (
    <span className={className}>
      {formattedValue}{suffix}
    </span>
  );
}

// Variant with spring physics
interface SpringAnimatedNumberProps {
  value: number;
  stiffness?: number; // Spring stiffness (default: 100)
  damping?: number; // Damping ratio (default: 15)
  decimals?: number;
  suffix?: string;
  className?: string;
}

export function SpringAnimatedNumber({
  value,
  stiffness = 100,
  damping = 15,
  decimals = 0,
  suffix = '',
  className = ''
}: SpringAnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const velocityRef = useRef(0);
  const currentRef = useRef(value);
  const animationRef = useRef<number | null>(null);
  
  useEffect(() => {
    const targetValue = value;
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    const animate = () => {
      const current = currentRef.current;
      const delta = targetValue - current;
      
      // Spring physics
      const spring = delta * stiffness * 0.001;
      velocityRef.current += spring;
      velocityRef.current *= Math.exp(-damping * 0.016); // Damping
      
      currentRef.current += velocityRef.current;
      setDisplayValue(currentRef.current);
      
      // Stop when close enough and velocity is low
      if (Math.abs(delta) < 0.5 && Math.abs(velocityRef.current) < 0.1) {
        currentRef.current = targetValue;
        setDisplayValue(targetValue);
        return;
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, stiffness, damping]);
  
  const formattedValue = decimals > 0 
    ? displayValue.toFixed(decimals) 
    : Math.round(displayValue).toString();
  
  return (
    <span className={className}>
      {formattedValue}{suffix}
    </span>
  );
}
