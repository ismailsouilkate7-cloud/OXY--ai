import { useRef, useState, type MouseEvent } from 'react';
import { motion, useInView } from 'framer-motion';

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  index: number;
}

export default function FeatureCard({ icon, title, description, index }: FeatureCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);
  const [glowX, setGlowX] = useState(50);
  const [glowY, setGlowY] = useState(50);
  const [isHovered, setIsHovered] = useState(false);

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setRotateX((y - 0.5) * -12);
    setRotateY((x - 0.5) * 12);
    setGlowX(x * 100);
    setGlowY(y * 100);
  }

  function handleMouseLeave() {
    setRotateX(0);
    setRotateY(0);
    setGlowX(50);
    setGlowY(50);
    setIsHovered(false);
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{
        duration: 0.5,
        delay: index * 0.08,
        ease: [0.16, 1, 0.3, 1],
      }}
      className="group perspective-[800px]"
    >
      <div
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
          transition: isHovered ? 'transform 0.08s ease-out' : 'transform 0.5s ease-out',
        }}
        className="relative glass-card rounded-3xl p-6 sm:p-8 h-full transition-all duration-500 hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5 overflow-hidden"
      >
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: `radial-gradient(circle at ${glowX}% ${glowY}%, rgba(99,102,241,0.12) 0%, transparent 60%)`,
          }}
        />
        <div className="relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-2xl mb-5 group-hover:bg-primary-subtle transition-colors duration-300 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-primary/10">
            {icon}
          </div>
          <h3 className="text-lg sm:text-xl font-semibold text-text-primary mb-3">
            {title}
          </h3>
          <p className="text-sm sm:text-base text-text-secondary leading-relaxed">
            {description}
          </p>
        </div>
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/5 via-transparent to-purple/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      </div>
    </motion.div>
  );
}
