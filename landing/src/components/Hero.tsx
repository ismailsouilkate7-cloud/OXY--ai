import { motion } from 'framer-motion';
import HeroScene from './HeroScene';

interface HeroProps {
  onOpenAuth: (mode: 'login' | 'signup') => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function Hero({ onOpenAuth }: HeroProps) {
  return (
    <section id="about" className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <HeroScene />

      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />

      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple/5 rounded-full blur-[100px] pointer-events-none" />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 text-center pt-24 pb-20"
      >
        <motion.div variants={itemVariants} className="mb-8">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold tracking-wide uppercase text-primary bg-primary-subtle rounded-full border border-primary/20">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse-glow" />
            Introducing VOSIL
          </span>
        </motion.div>

        <motion.h1
          variants={itemVariants}
          className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold leading-[1.05] tracking-tight mb-6"
        >
          Experience the future of{' '}
          <span className="text-gradient">Intelligence</span>
        </motion.h1>

        <motion.p
          variants={itemVariants}
          className="text-base sm:text-lg md:text-xl text-text-secondary max-w-3xl mx-auto leading-relaxed mb-10"
        >
          VOSIL is an advanced conversational model designed for complex reasoning,
          seamless coding, and deep analysis. Fast, secure, and always learning,
          perfect darija.
        </motion.p>

        <motion.div
          variants={itemVariants}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <button
            onClick={() => onOpenAuth('signup')}
            className="group relative px-8 py-3.5 text-base font-semibold text-white bg-primary rounded-2xl transition-all duration-300 hover:bg-primary-hover active:scale-[0.97] overflow-hidden"
          >
            <span className="relative z-10">Get started free</span>
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary via-purple to-cyan opacity-0 group-hover:opacity-30 blur-xl transition-opacity duration-500" />
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-primary via-purple to-cyan opacity-0 group-hover:opacity-40 blur-md transition-opacity duration-500 -z-10" />
          </button>
          <button
            onClick={() => onOpenAuth('login')}
            className="px-8 py-3.5 text-base font-semibold text-text-primary bg-white/5 border border-border rounded-2xl transition-all duration-300 hover:bg-white/10 hover:border-primary/30 active:scale-[0.97]"
          >
            Log in
          </button>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="mt-12 flex items-center justify-center text-sm text-text-muted"
        >
          <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary-subtle px-4 py-2">
            <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            All features are free
          </div>
        </motion.div>
      </motion.div>

      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-surface to-transparent pointer-events-none" />
    </section>
  );
}
