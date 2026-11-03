import { useEffect, useState } from 'react'

// Tiny hash router (#/progress/bench) – works on GitHub Pages and offline without server config.
function current(): string[] {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(current)
  useEffect(() => {
    const onChange = () => {
      setRoute(current())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function go(path: string) {
  location.hash = path.startsWith('/') ? path : `/${path}`
}

export function back(fallback = '/') {
  if (history.length > 1) history.back()
  else go(fallback)
}
