import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { motion } from 'framer-motion';
import { AuthProvider, useAuth } from './lib/AuthContext';
import Header from './components/Header';
import Hero from './components/Hero';
import Background3D from './components/Background3D';
import AuthModal from './components/AuthModal';

const Features = lazy(() => import('./components/Features'));
const Demo = lazy(() => import('./components/Demo'));
const Footer = lazy(() => import('./components/Footer'));

function AuthGate({ children }: { children: React.ReactNode }) {
  const { authState, loading } = useAuth();

  // Log every render
  console.log('AuthGate RENDER — loading:', loading, 'user:', authState?.user?.email ?? null);

  useEffect(() => {
    if (loading) {
      console.log('AuthGate EFFECT: loading=true, waiting for Firebase auth');
      return;
    }

    if (authState?.user) {
      console.log('AuthGate EFFECT: user FOUND — redirecting to /chat.html (' + authState.user.email + ')');
      // Use window.location.replace to avoid back-button issues
      window.location.replace('/chat.html');
    } else {
      console.log('AuthGate EFFECT: no user, rendering landing page');
    }
  }, [loading, authState]);

  if (loading) {
    console.log('AuthGate RENDER: showing loading splash');
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0f0f0f'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontSize: '2rem', fontWeight: 800, letterSpacing: '0.15em',
            marginBottom: '1.5rem', color: '#fff'
          }}>
            <span style={{ color: '#b388ff' }}>VO</span>SIL
          </div>
          <div style={{
            width: 24, height: 24, margin: '0 auto',
            border: '2px solid rgba(255,255,255,0.1)',
            borderTopColor: '#b388ff',
            borderRadius: '50%',
            animation: 'oxi-spin 0.8s linear infinite'
          }} />
          <style>{`@keyframes oxi-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (authState?.user) {
    console.log('AuthGate RENDER: user found (' + authState.user.email + '), returning null (redirect in effect)');
    return null;
  }

  console.log('AuthGate RENDER: no user, rendering PageContent (landing page)');
  return <>{children}</>;
}

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
      <AuthGate>
        <PageContent />
      </AuthGate>
    </AuthProvider>
  );
}
