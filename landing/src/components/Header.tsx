import { motion } from 'framer-motion';

interface HeaderProps {
  onOpenAuth: (mode: 'login' | 'signup') => void;
}

const navLinks = [
  { label: 'About', href: '#about' },
  { label: 'Features', href: '#features' },
  { label: 'Demo', href: '#demo' },
];

export default function Header({ onOpenAuth }: HeaderProps) {
  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="glass my-3 rounded-2xl px-5 py-3 flex items-center justify-between border border-white/5 shadow-xl shadow-black/20">
          <a href="/" className="flex items-center gap-3 group">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 rounded-full border-2 border-primary opacity-80 group-hover:opacity-100 transition-opacity" />
              <div className="absolute inset-1 rounded-full bg-primary/20 group-hover:bg-primary/30 transition-colors" />
            </div>
            <span className="text-lg font-bold tracking-wider">
              <span className="text-primary">VO</span>
              <span className="text-text-primary">SIL</span>
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors duration-200"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onOpenAuth('login')}
              className="hidden sm:inline-flex px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors duration-200"
            >
              Log in
            </button>
            <button
              onClick={() => onOpenAuth('signup')}
              className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary-hover transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.97]"
            >
              Sign up
            </button>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
