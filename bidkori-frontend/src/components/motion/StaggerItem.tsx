'use client';

import * as React from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { staggerItemVariants } from '@/lib/motion/variants';

export interface StaggerItemProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  className?: string;
}

export default function StaggerItem({
  children,
  className = '',
  ...props
}: StaggerItemProps) {
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
      variants={staggerItemVariants}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}
