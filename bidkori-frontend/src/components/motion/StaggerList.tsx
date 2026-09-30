'use client';

import * as React from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { staggerListVariants } from '@/lib/motion/variants';

export interface StaggerListProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  staggerDelay?: number;
  className?: string;
  viewportOnce?: boolean;
}

export default function StaggerList({
  children,
  staggerDelay = 0.06,
  className = '',
  viewportOnce = true,
  ...props
}: StaggerListProps) {
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
      variants={staggerListVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: viewportOnce, amount: 0.1 }}
      custom={staggerDelay}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
