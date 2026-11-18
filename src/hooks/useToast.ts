'use client';

import { useCallback } from 'react';
import { toast } from '@/components/ui/toast';

type ToastVariant = 'success' | 'info' | 'warning' | 'error';

export function useToast() {
  const showToast = useCallback((
    message: string,
    variant: ToastVariant = 'info',
    description?: string,
    options?: { strobe?: boolean },
  ) => {
    toast.add({
      title: message,
      description,
      type: variant,
      strobe: options?.strobe,
    });
  }, []);

  return { showToast };
}
