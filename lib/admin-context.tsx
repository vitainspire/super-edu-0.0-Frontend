'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { backendFetch } from '@/lib/backend'
import type { Admin, School } from '@/lib/types'

interface AdminContextType {
  admin: Admin | null
  school: School | null
  isLoading: boolean
  logout: () => Promise<void>
}

const AdminContext = createContext<AdminContextType>({
  admin: null,
  school: null,
  isLoading: true,
  logout: async () => {},
})

export function useAdmin() {
  return useContext(AdminContext)
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [school, setSchool] = useState<School | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    backendFetch('/api/admin/me')
      .then(r => r.json())
      .then(data => {
        if (data.admin) {
          setAdmin(data.admin)
          setSchool(data.school ?? null)
        } else {
          router.replace('/admin/login')
        }
      })
      .catch(() => router.replace('/admin/login'))
      .finally(() => setIsLoading(false))
  }, [router])

  async function logout() {
    await supabase.auth.signOut()
    document.cookie = 'edu-role=; path=/; max-age=0; SameSite=Strict'
    document.cookie = 'edu-session=; path=/; max-age=0; SameSite=Strict'
    router.replace('/admin/login')
  }

  return (
    <AdminContext.Provider value={{ admin, school, isLoading, logout }}>
      {children}
    </AdminContext.Provider>
  )
}
