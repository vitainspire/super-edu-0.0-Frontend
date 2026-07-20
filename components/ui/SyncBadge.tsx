import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import clsx from 'clsx'

interface SyncBadgeProps {
  status: 'online' | 'offline' | 'syncing'
}

export default function SyncBadge({ status }: SyncBadgeProps) {
  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
        status === 'online' && 'bg-green-100 text-green-700',
        status === 'offline' && 'bg-gray-100 text-gray-600',
        status === 'syncing' && 'bg-blue-100 text-blue-700',
      )}
    >
      {status === 'online' && <Wifi size={12} />}
      {status === 'offline' && <WifiOff size={12} />}
      {status === 'syncing' && <RefreshCw size={12} className="animate-spin" />}
      <span className="capitalize">{status}</span>
    </div>
  )
}
