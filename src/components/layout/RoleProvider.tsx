'use client';
import { createContext, useContext, type ReactNode } from 'react';

interface RoleContextValue {
  canCreateReview: boolean;
  canAccessCustomerProjectCenter: boolean;
  canReviewDailyReports: boolean;
}

const RoleContext = createContext<RoleContextValue>({
  canCreateReview: false,
  canAccessCustomerProjectCenter: false,
  canReviewDailyReports: false,
});

export function RoleProvider({
  canCreateReview,
  canAccessCustomerProjectCenter,
  canReviewDailyReports,
  children,
}: RoleContextValue & { children: ReactNode }) {
  return (
    <RoleContext.Provider
      value={{
        canCreateReview,
        canAccessCustomerProjectCenter,
        canReviewDailyReports,
      }}
    >
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

export function useCanReviewDailyReports(): boolean {
  return useContext(RoleContext).canReviewDailyReports;
}
