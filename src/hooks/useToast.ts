'use client';

import { useCallback } from 'react';
import { toast } from '@/components/ui/toast';

type ToastVariant = 'success' | 'info' | 'warning' | 'error';

export function useToast() {
  const showToast = useCallback((message: string, variant: ToastVariant = 'info', description?: string) => {
    toast.add({
      title: message,
      description,
      type: variant,
    });
  }, []);

  return { showToast };
}
