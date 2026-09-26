'use client';
import { createContext, useContext, type ReactNode } from 'react';

interface RoleContextValue {
  canCreateReview: boolean;
  canAccessCustomerProjectCenter: boolean;
}

const RoleContext = createContext<RoleContextValue>({
  canCreateReview: false,
  canAccessCustomerProjectCenter: false,
});

export function RoleProvider({
  canCreateReview,
  canAccessCustomerProjectCenter,
  children,
}: RoleContextValue & { children: ReactNode }) {
  return (
    <RoleContext.Provider value={{ canCreateReview, canAccessCustomerProjectCenter }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useCanCreateReview(): boolean {
  return useContext(RoleContext).canCreateReview;
}

export function useCanAccessCustomerProjectCenter(): boolean {
  return useContext(RoleContext).canAccessCustomerProjectCenter;
}
