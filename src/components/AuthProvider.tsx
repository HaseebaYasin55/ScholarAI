"use client";

import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useAppStore } from '@/store/appStore';

export default function AuthProvider() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const fetchData = useAppStore((state) => state.fetchData);

  useEffect(() => {
    const init = async () => {
      await initializeAuth();
      await fetchData();
    };
    init();
  }, [initializeAuth, fetchData]);

  return null;
}
