'use client';

import * as React from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { scaleInVariants } from '@/lib/motion/variants';

export interface ScaleInProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  viewportOnce?: boolean;
}

export default function ScaleIn({
  children,
  delay = 0,
  className = '',
  viewportOnce = true,
  ...props
}: ScaleInProps) {
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
      variants={scaleInVariants}
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
