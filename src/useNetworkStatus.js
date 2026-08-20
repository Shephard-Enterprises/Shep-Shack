import { useEffect, useState } from 'react'

function readNetworkStatus() {
  const connection = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection
  return {
    online: navigator.onLine,
    effectiveType: connection?.effectiveType ?? null,
    downlink: connection?.downlink ?? null,
    rtt: connection?.rtt ?? null,
  }
}

export function useNetworkStatus() {
  const [network, setNetwork] = useState(readNetworkStatus)

  useEffect(() => {
    const update = () => setNetwork(readNetworkStatus())
    const connection = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection

    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    connection?.addEventListener?.('change', update)

    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      connection?.removeEventListener?.('change', update)
    }
  }, [])

  return network
}
