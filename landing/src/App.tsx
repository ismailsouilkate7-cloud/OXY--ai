import { useState, useCallback, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { AuthProvider } from './lib/AuthContext';
import Header from './components/Header';
import Hero from './components/Hero';
import Background3D from './components/Background3D';
import AuthModal from './components/AuthModal';

const Features = lazy(() => import('./components/Features'));
const Demo = lazy(() => import('./components/Demo'));
const Footer = lazy(() => import('./components/Footer'));

function PageContent() {
  const [authModal, setAuthModal] = useState<{ open: boolean; mode: 'login' | 'signup' }>({
    open: false,
    mode: 'login',
  });

  const openAuth = useCallback((mode: 'login' | 'signup') => {
    setAuthModal({ open: true, mode });
  }, []);

  const closeAuth = useCallback(() => {
    setAuthModal({ open: false, mode: 'login' });
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <Background3D />
      <Header onOpenAuth={openAuth} />
      <Hero onOpenAuth={openAuth} />

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-32">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        }
      >
        <Features />
        <Demo />
        <Footer />
      </Suspense>

      <AuthModal
        isOpen={authModal.open}
        initialMode={authModal.mode}
        onClose={closeAuth}
      />
    </motion.div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PageContent />
    </AuthProvider>
  );
}
