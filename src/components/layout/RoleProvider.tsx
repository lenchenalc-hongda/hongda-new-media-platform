'use client';
import { createContext, useContext, type ReactNode } from 'react';

interface RoleContextValue {
  canCreateReview: boolean;
  canAccessCustomerProjectCenter: boolean;
  canAccessCustomerProjectTeam: boolean;
  canReviewDailyReports: boolean;
}

const RoleContext = createContext<RoleContextValue>({
  canCreateReview: false,
  canAccessCustomerProjectCenter: false,
  canAccessCustomerProjectTeam: false,
  canReviewDailyReports: false,
});

export function RoleProvider({
  canCreateReview,
  canAccessCustomerProjectCenter,
  canAccessCustomerProjectTeam,
  canReviewDailyReports,
  children,
}: RoleContextValue & { children: ReactNode }) {
  return (
    <RoleContext.Provider
      value={{
        canCreateReview,
        canAccessCustomerProjectCenter,
        canAccessCustomerProjectTeam,
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

export function useCanAccessCustomerProjectTeam(): boolean {
  return useContext(RoleContext).canAccessCustomerProjectTeam;
}

export function useCanReviewDailyReports(): boolean {
  return useContext(RoleContext).canReviewDailyReports;
}
