'use client';

import { useCallback } from 'react';
import { toast } from '@/components/ui/toast';

export function useToast() {
  const showToast = useCallback((message: string, variant?: string) => {
    void variant;
    toast.add({
      title: message,
    });
  }, []);

  return { showToast };
}
