'use client'

import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import { useUser } from '@clerk/nextjs'
import type { MeResponse } from '@orientation/contracts'
import { fetchMe } from '@/lib/pass'

export type UserRole = 'STUDENT' | 'VOLUNTEER' | 'ADMIN'

export interface UserStatusContextValue {
  isLoaded: boolean
  isSignedIn: boolean
  isRegistered: boolean
  hasPass: boolean
  role: UserRole
  registration: MeResponse['registration'] | null
  meData: MeResponse | null
  refresh: () => Promise<void>
}

const UserStatusContext = createContext<UserStatusContextValue>({
  isLoaded: false,
  isSignedIn: false,
  isRegistered: false,
  hasPass: false,
  role: 'STUDENT',
  registration: null,
  meData: null,
  refresh: async () => {},
})

export function UserStatusProvider({ children }: { children: ReactNode }) {
  const { user, isLoaded: clerkLoaded, isSignedIn } = useUser()
  const [meData, setMeData] = useState<MeResponse | null>(null)
  const [loadingMe, setLoadingMe] = useState(false)

  const role = (user?.publicMetadata?.role as UserRole | undefined) ?? 'STUDENT'

  const loadMe = useCallback(async () => {
    if (!isSignedIn) {
      setMeData(null)
      return
    }
    setLoadingMe(true)
    try {
      const res = await fetchMe()
      if (res.ok) {
        setMeData(res.data)
      } else {
        setMeData(null)
      }
    } catch {
      setMeData(null)
    } finally {
      setLoadingMe(false)
    }
  }, [isSignedIn])

  useEffect(() => {
    if (clerkLoaded) {
      void loadMe()
    }
  }, [clerkLoaded, loadMe])

  const isRegistered = Boolean(meData?.registration)
  const hasPass = Boolean(meData?.pass)

  const value = useMemo<UserStatusContextValue>(
    () => ({
      isLoaded: clerkLoaded && (!isSignedIn || !loadingMe || meData !== null),
      isSignedIn: Boolean(isSignedIn),
      isRegistered,
      hasPass,
      role,
      registration: meData?.registration ?? null,
      meData,
      refresh: loadMe,
    }),
    [clerkLoaded, isSignedIn, loadingMe, meData, isRegistered, hasPass, role, loadMe],
  )

  return <UserStatusContext.Provider value={value}>{children}</UserStatusContext.Provider>
}

export function useUserStatus(): UserStatusContextValue {
  return useContext(UserStatusContext)
}
