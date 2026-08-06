'use client'
import { useApp } from '@/lib/context'
import SyncBadge from './SyncBadge'

export function SyncBadgeWrapper() {
  const { syncStatus } = useApp()
  return <SyncBadge status={syncStatus} />
}
