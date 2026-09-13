'use client';
import { createContext, useContext, type ReactNode } from 'react';

interface RoleContextValue {
  canCreateReview: boolean;
}

const RoleContext = createContext<RoleContextValue>({ canCreateReview: false });

export function RoleProvider({
  canCreateReview,
  children,
}: RoleContextValue & { children: ReactNode }) {
  return (
    <RoleContext.Provider value={{ canCreateReview }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useCanCreateReview(): boolean {
  return useContext(RoleContext).canCreateReview;
}
