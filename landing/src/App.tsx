import Header from './components/Header';
import Features from './components/Features';
import Demo from './components/Demo';
import Footer from './components/Footer';
import { motion } from 'framer-motion';

function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 overflow-hidden">
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="relative z-10 text-center max-w-4xl mx-auto pt-28 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mb-6"
        >
          <span className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs font-medium text-text-secondary">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Open access — no account required
          </span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6"
        >
          Meet <span className="text-gradient">VOSIL</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Your intelligent, natural conversational assistant with multimodal capabilities —
          reasoning, coding, documents, images and video, in Moroccan Darija and beyond.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a
            href="/chat"
            className="px-8 py-4 text-base font-semibold text-white bg-primary rounded-2xl hover:bg-primary-hover transition-all duration-200 hover:shadow-xl hover:shadow-primary/20 active:scale-[0.97]"
          >
            Start Chatting
          </a>
          <a
            href="#features"
            className="px-8 py-4 text-base font-medium text-text-secondary hover:text-text-primary transition-colors duration-200"
          >
            Explore features
          </a>
        </motion.div>
      </div>
    </section>
  );
}

function About() {
  return (
    <section id="about" className="relative py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-3xl"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6">
            Built to <span className="text-gradient">understand you</span>
          </h2>
          <p className="text-lg text-text-secondary leading-relaxed">
            VOSIL talks like a friend and thinks like an expert — responding naturally in
            whatever language you prefer, searching the live web, and analyzing images,
            documents and video in real time.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-surface text-text-primary font-sans">
      <Header />
      <main>
        <Hero />
        <About />
        <Features />
        <Demo />
      </main>
      <Footer />
    </div>
  );
}