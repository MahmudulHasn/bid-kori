'use client';

import * as React from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { fadeUpVariants } from '@/lib/motion/variants';

export interface MotionSectionProps extends HTMLMotionProps<'section'> {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

export default function MotionSection({
  children,
  className = '',
  delay = 0,
  ...props
}: MotionSectionProps) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return (
      <section className={className} id={props.id} style={props.style as React.CSSProperties}>
        {children}
      </section>
    );
  }

  return (
    <motion.section
      variants={fadeUpVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.12 }}
      custom={delay}
      className={className}
      {...props}
    >
      {children}
    </motion.section>
  );
}
