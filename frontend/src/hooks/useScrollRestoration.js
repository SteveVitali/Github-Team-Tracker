import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Custom hook to restore and save scroll position for a page
 * @param {string} key - Unique key to identify this page's scroll position in sessionStorage
 */
export function useScrollRestoration(key) {
  const location = useLocation()

  useEffect(() => {
    // Restore scroll position when component mounts
    const savedPosition = sessionStorage.getItem(`scroll_${key}`)
    if (savedPosition) {
      const position = parseInt(savedPosition, 10)
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        window.scrollTo(0, position)
      })
    }

    // Save scroll position when navigating away
    const saveScrollPosition = () => {
      sessionStorage.setItem(`scroll_${key}`, window.scrollY.toString())
    }

    // Save on unmount
    return () => {
      saveScrollPosition()
    }
  }, [key, location.pathname])

  // Also save scroll position periodically (in case user uses browser back button)
  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem(`scroll_${key}`, window.scrollY.toString())
    }

    // Throttle scroll events
    let timeoutId
    const throttledScroll = () => {
      if (timeoutId) {
        return
      }
      timeoutId = setTimeout(() => {
        handleScroll()
        timeoutId = null
      }, 100)
    }

    window.addEventListener('scroll', throttledScroll)

    return () => {
      window.removeEventListener('scroll', throttledScroll)
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [key])
}
