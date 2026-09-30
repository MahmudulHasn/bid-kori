'use client';

import * as React from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { fadeUpVariants } from '@/lib/motion/variants';

export interface FadeUpProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  viewportOnce?: boolean;
}

export default function FadeUp({
  children,
  delay = 0,
  className = '',
  viewportOnce = true,
  ...props
}: FadeUpProps) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return (
      <div className={className} id={props.id} style={props.style as React.CSSProperties}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      variants={fadeUpVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: viewportOnce, amount: 0.15 }}
      custom={delay}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
