'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { Role } from '@/lib/auth/types';

interface RoleContextValue {
  canCreateReview: boolean;
  canAccessCustomerProjectCenter: boolean;
  canAccessCustomerProjectTeam: boolean;
  canAccessCustomerProjectSettings: boolean;
  canReviewDailyReports: boolean;
  currentUserName: string | null;
  currentUserRole: Role | null;
}

const RoleContext = createContext<RoleContextValue>({
  canCreateReview: false,
  canAccessCustomerProjectCenter: false,
  canAccessCustomerProjectTeam: false,
  canAccessCustomerProjectSettings: false,
  canReviewDailyReports: false,
  currentUserName: null,
  currentUserRole: null,
});

export function RoleProvider({
  canCreateReview,
  canAccessCustomerProjectCenter,
  canAccessCustomerProjectTeam,
  canAccessCustomerProjectSettings,
  canReviewDailyReports,
  currentUserName,
  currentUserRole,
  children,
}: RoleContextValue & { children: ReactNode }) {
  return (
    <RoleContext.Provider
      value={{
        canCreateReview,
        canAccessCustomerProjectCenter,
        canAccessCustomerProjectTeam,
        canAccessCustomerProjectSettings,
        canReviewDailyReports,
        currentUserName,
        currentUserRole,
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

export function useCanAccessCustomerProjectSettings(): boolean {
  return useContext(RoleContext).canAccessCustomerProjectSettings;
}

export function useCanReviewDailyReports(): boolean {
  return useContext(RoleContext).canReviewDailyReports;
}


export function useCurrentUserName(): string | null {
  return useContext(RoleContext).currentUserName;
}

export function useCurrentUserRole(): Role | null {
  return useContext(RoleContext).currentUserRole;
}
