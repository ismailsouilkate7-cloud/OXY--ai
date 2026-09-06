// Landing page removed — public authentication system disabled.
// This app will be reconfigured with password-based authentication in Part 2.

export default function App() {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f0f0f',
      color: '#e8e8ed',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      zIndex: 1,
    }}>
      <div style={{ textAlign: 'center', maxWidth: '500px', padding: '2rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem', fontWeight: 700 }}>
          VOSIL
        </h1>
        <p style={{ fontSize: '1rem', color: '#8a8a9a', marginBottom: '2rem', lineHeight: 1.6 }}>
          Public access has been disabled. The authentication system is being reconfigured.
        </p>
        <p style={{ fontSize: '0.875rem', color: '#5a5a6a' }}>
          Please check back soon.
        </p>
      </div>
    </div>
  );
}
