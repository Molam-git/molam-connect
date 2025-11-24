/**
 * Authentication Context
 * Gère l'authentification avec Molam ID JWT
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { jwtDecode } from 'jwt-decode';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'merchant' | 'admin';
  merchantId?: string;
  country: string;
  currency: string;
  locale: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing token on mount
    const token = localStorage.getItem('molam_token');
    if (token) {
      try {
        const decoded = jwtDecode<any>(token);

        // Check if token is expired
        if (decoded.exp && decoded.exp * 1000 < Date.now()) {
          logout();
        } else {
          setUser({
            id: decoded.sub || decoded.user_id,
            name: decoded.name || decoded.username || 'User',
            email: decoded.email || '',
            role: decoded.role || decoded.roles?.[0] || 'customer',
            merchantId: decoded.merchant_id,
            country: decoded.country || 'SN',
            currency: decoded.currency || 'XOF',
            locale: decoded.lang || 'fr'
          });
        }
      } catch (error) {
        console.error('Invalid token:', error);
        logout();
      }
    }
    setLoading(false);
  }, []);

  const login = (token: string) => {
    try {
      const decoded = jwtDecode<any>(token);

      localStorage.setItem('molam_token', token);

      setUser({
        id: decoded.sub || decoded.user_id,
        name: decoded.name || decoded.username || 'User',
        email: decoded.email || '',
        role: decoded.role || decoded.roles?.[0] || 'customer',
        merchantId: decoded.merchant_id,
        country: decoded.country || 'SN',
        currency: decoded.currency || 'XOF',
        locale: decoded.lang || 'fr'
      });
    } catch (error) {
      console.error('Failed to decode token:', error);
      throw new Error('Invalid token');
    }
  };

  const logout = () => {
    localStorage.removeItem('molam_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        login,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
