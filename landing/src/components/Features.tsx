import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import FeatureCard from './FeatureCard';

const features = [
  {
    icon: '\u{1F9E0}',
    title: 'Advanced Reasoning',
    description:
      'VOSIL breaks down complex problems into logical steps, providing thorough and accurate solutions.',
  },
  {
    icon: '\u{1F4BB}',
    title: 'Expert Coding',
    description:
      'Write, debug, and optimize code in dozens of languages with context-aware intelligence.',
  },
  {
    icon: '\u{1F4C4}',
    title: 'Document Analysis',
    description:
      'Upload Images, PDFs, Videos, VOSIL understands content instantly and answers your specific questions.',
  },
  {
    icon: '\u26A1',
    title: 'Lightning Fast',
    description:
      'Experience real-time responses with state-of-the-art streaming architecture built for speed.',
  },
  {
    icon: '\u{1F4AC}',
    title: 'Moroccan Darija',
    description:
      'VOSIL can understand and respond with perfect Moroccan Darija.',
  },
  {
    icon: '\u{1F30D}',
    title: 'Languages',
    description:
      'VOSIL can understand and respond in multiple languages.',
  },
  {
    icon: '\u{1F916}',
    title: 'Talking',
    description:
      'VOSIL talk like a human not robot and friendly personality.',
  },
  {
    icon: '\u{1F3A8}',
    title: 'Design',
    description:
      'Easy, Modern UI, the user can understand the page of the AI chat easily.',
  },
];

export default function Features() {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section id="features" ref={ref} className="relative py-24 sm:py-32">
      <div className="absolute inset-0 feature-glow pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-16 sm:mb-20"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
            Supercharge your{' '}
            <span className="text-gradient">workflow</span>
          </h2>
          <p className="text-lg text-text-secondary max-w-xl mx-auto">
            Advanced capabilities designed for professionals and creators.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((feature, index) => (
            <FeatureCard
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              index={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
