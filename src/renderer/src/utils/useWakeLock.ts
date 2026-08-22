import { useEffect, useRef, useState } from 'react'

/**
 * Custom React hook to prevent mobile and desktop screens from sleeping / dimming
 * while active (e.g. while reading guitar tablature or PDF sheet music).
 *
 * Uses the standard Screen Wake Lock API (`navigator.wakeLock`) with automatic
 * visibility-change reacquisition, plus a graceful fallback for older mobile browsers.
 */
export function useWakeLock(enabled: boolean = true): { isSupported: boolean; isActive: boolean } {
  const isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
  const [isActive, setIsActive] = useState<boolean>(false)
  const isActiveRef = useRef<boolean>(false)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    let isMounted = true

    const markActive = (active: boolean): void => {
      isActiveRef.current = active
      if (isMounted) {
        setIsActive(active)
      }
    }

    const requestLock = async (): Promise<void> => {
      if (!isMounted) return

      // Method 1: Standard Screen Wake Lock API
      if (isSupported) {
        try {
          if (document.visibilityState === 'visible') {
            const sentinel = await navigator.wakeLock.request('screen')
            if (!isMounted) {
              sentinel.release().catch(() => {})
              return
            }
            wakeLockRef.current = sentinel
            markActive(true)

            sentinel.addEventListener('release', () => {
              if (wakeLockRef.current === sentinel) {
                wakeLockRef.current = null
                markActive(false)
              }
            })
          }
        } catch (err) {
          console.warn('[useWakeLock] Wake Lock request not granted or failed:', err)
          fallbackToVideo()
        }
      } else {
        fallbackToVideo()
      }
    }

    // Method 2: Video fallback for older mobile Safari / WebViews
    const fallbackToVideo = (): void => {
      if (!isMounted || videoRef.current) return
      try {
        const video = document.createElement('video')
        video.setAttribute('playsinline', 'true')
        video.setAttribute('webkit-playsinline', 'true')
        video.setAttribute('muted', 'true')
        video.setAttribute('loop', 'true')
        video.muted = true
        video.style.position = 'fixed'
        video.style.top = '-9999px'
        video.style.left = '-9999px'
        video.style.width = '1px'
        video.style.height = '1px'
        video.style.opacity = '0.001'
        video.style.pointerEvents = 'none'

        // Minimal valid base64 MP4 loop video
        video.src =
          'data:video/mp4;base64,AAAAHGZ0eXBtcDQyAAAAAG1wNDJpc29tYXZjMQAAADFtb292AAAAbG12aGQAAAAA19WqctfVqnMAAA+gAAAAAAABAAABAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAAAGGlvZHMAAAAAEICAgAcAAAAAAA=='

        document.body.appendChild(video)
        videoRef.current = video

        video
          .play()
          .then(() => {
            markActive(true)
          })
          .catch(() => {
            const onUserGesture = (): void => {
              video
                .play()
                .then(() => {
                  markActive(true)
                })
                .catch(() => {})
              window.removeEventListener('touchstart', onUserGesture)
              window.removeEventListener('click', onUserGesture)
            }
            window.addEventListener('touchstart', onUserGesture, { once: true, passive: true })
            window.addEventListener('click', onUserGesture, { once: true, passive: true })
          })
      } catch {
        // ignore
      }
    }

    requestLock()

    // Re-acquire lock if user switches back to the webapp tab
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible' && enabled) {
        requestLock()
      }
    }

    // Try requesting again on user touch/click if initial request was blocked
    const handleUserInteraction = (): void => {
      if (!wakeLockRef.current && !isActiveRef.current && enabled) {
        requestLock()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('touchstart', handleUserInteraction, { passive: true, once: true })
    window.addEventListener('click', handleUserInteraction, { passive: true, once: true })

    return () => {
      isMounted = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('touchstart', handleUserInteraction)
      window.removeEventListener('click', handleUserInteraction)

      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {})
        wakeLockRef.current = null
      }
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.remove()
        videoRef.current = null
      }
      markActive(false)
    }
  }, [enabled, isSupported])

  return { isSupported, isActive }
}
