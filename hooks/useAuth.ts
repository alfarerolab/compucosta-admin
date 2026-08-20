'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  username: string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export function useAuth() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const checkTokenExpiration = useCallback((token: string): boolean => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentTime = Math.floor(Date.now() / 1000);
      
      if (payload.exp && payload.exp < currentTime) {
        return true; // Token expirado
      }
      return false; // Token válido
    } catch (error) {
      console.error('Error al verificar expiración del token:', error);
      return true; // En caso de error, considerar como expirado
    }
  }, []);

  const logout = useCallback((expired = false) => {
    // Limpiar datos
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Actualizar estado
    setAuthState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });

    // Redirigir al login
    if (expired) {
      router.push('/login?expired=true');
    } else {
      router.push('/login?logout=true');
    }
  }, [router]);

  const checkAuth = useCallback(() => {
    try {
      const token = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');

      if (!token || !userStr) {
        setAuthState({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return;
      }

      // Verificar si el token está expirado
      if (checkTokenExpiration(token)) {
        console.log('Token expirado');
        logout(true);
        return;
      }

      // Token válido
      const user = JSON.parse(userStr);
      setAuthState({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error en checkAuth:', error);
      setAuthState({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }, [checkTokenExpiration, logout]);

  const login = useCallback((token: string, user: User) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    
    setAuthState({
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
    });
  }, []);

  // Verificar autenticación al montar
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Verificar token cada 5 minutos
  useEffect(() => {
    const interval = setInterval(() => {
      const token = localStorage.getItem('token');
      if (token && checkTokenExpiration(token)) {
        logout(true);
      }
    }, 5 * 60 * 1000); // 5 minutos

    return () => clearInterval(interval);
  }, [checkTokenExpiration, logout]);

  return {
    ...authState,
    login,
    logout,
    checkAuth,
  };
}