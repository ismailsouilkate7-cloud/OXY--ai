type AuthErrorResult = {
  message: string;
  action?: {
    label: string;
    targetMode: 'login' | 'signup';
  };
};

function getErrorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
  }

  return null;
}

export function getFriendlyAuthError(error: unknown, mode: 'login' | 'signup'): AuthErrorResult {
  const code = getErrorCode(error);

  if (mode === 'signup' && code === 'auth/email-already-in-use') {
    return {
      message: 'This email is already registered. Please log in instead.',
      action: { label: 'Log in', targetMode: 'login' },
    };
  }

  if (mode === 'login' && code === 'auth/user-not-found') {
    return {
      message: 'No account found with this email. Please sign up first.',
      action: { label: 'Sign up', targetMode: 'signup' },
    };
  }

  switch (code) {
    case 'auth/email-already-in-use':
      return {
        message: 'This email is already registered. Please log in instead.',
      };
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return { message: 'Incorrect email or password. Please try again.' };
    case 'auth/user-not-found':
      return { message: 'No account found with this email. Please sign up first.' };
    case 'auth/weak-password':
      return { message: 'Password is too weak. Please use at least 6 characters.' };
    case 'auth/invalid-email':
      return { message: 'Please enter a valid email address.' };
    case 'auth/too-many-requests':
      return { message: 'Too many attempts. Please wait a moment and try again.' };
    case 'auth/network-request-failed':
      return { message: 'Network error. Please check your connection and try again.' };
    default:
      return { message: 'We could not complete that request. Please try again.' };
  }
}
