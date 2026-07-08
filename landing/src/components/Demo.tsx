import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

export default function Demo() {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section id="demo" ref={ref} className="relative py-24 sm:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/3 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
            See it in{' '}
            <span className="text-gradient-cyan">action</span>
          </h2>
          <p className="text-lg text-text-secondary max-w-xl mx-auto">
            Experience VOSIL&apos;s natural conversation flow.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40, rotateX: 5 }}
          animate={isInView ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 40, rotateX: 5 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          style={{ perspective: '1000px' }}
          className="group"
        >
          <div className="glass rounded-2xl overflow-hidden shadow-2xl shadow-primary/5 transition-shadow duration-500 group-hover:shadow-primary/10">
            <div className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-border">
              <div className="flex gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <span className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <span className="flex-1 text-center text-xs font-medium text-text-muted">
                VOSIL Interface
              </span>
            </div>

            <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-6">
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="self-end max-w-[85%] sm:max-w-[70%]"
              >
                <div className="bg-surface-elevated rounded-2xl rounded-br-sm px-4 py-3 sm:px-5 sm:py-4 text-sm sm:text-base leading-relaxed text-text-primary">
                  t9der t3aweni bach nbni modern site web application bsti3mal React ou Node.js?
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="self-start max-w-[90%] sm:max-w-[75%] flex gap-3"
              >
                <div className="w-8 h-8 rounded-full border-2 border-primary flex-shrink-0 mt-1 shadow-lg shadow-primary/10" />
                <div className="bg-primary-subtle border border-primary/20 rounded-2xl rounded-bl-sm px-4 py-3 sm:px-5 sm:py-4 text-sm sm:text-base leading-relaxed text-text-primary">
                  <p className="mb-3">
                    Afeeen asat bekher{' '}
                    <span role="img" aria-label="wave">
                      👋
                    </span>
                    ? mohim hahia structured plan l-React ou Node.js stack...
                  </p>
                  <div className="bg-surface rounded-xl overflow-hidden border border-border">
                    <div className="flex items-center gap-2 px-3 py-2 bg-surface-secondary border-b border-border">
                      <span className="w-2 h-2 rounded-full bg-primary/50" />
                      <span className="text-xs text-text-muted font-mono">bash</span>
                    </div>
                    <div className="p-3 font-mono text-xs sm:text-sm text-cyan leading-relaxed">
                      npx create-react-app frontend<br />
                      mkdir backend {'&&'} cd backend<br />
                      npm init -y
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
