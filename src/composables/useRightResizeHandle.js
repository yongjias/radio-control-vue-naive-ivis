export function useRightResizeHandle(elRef, options = {}) {
  const {
    minWidth = 185,
    handleSelector = '.resizeHandle',
    cooldownMs = 120,
    getMaxWidth = () => window.innerWidth - 6,
    widthRef = null,
    computeWidth = null,
  } = options

  const isResizing = ref(false)
  const width = widthRef || ref(0)
  let maxW = null

  let ignoreDragUntil = 0

  const canStartDrag = (ev) => {
    if (isResizing.value) return false
    if (ignoreDragUntil && performance.now() < ignoreDragUntil) return false

    const target = ev?.target
    if (target && target.closest && target.closest(handleSelector)) return false

    return true
  }

  const onResizePointerDown = (e) => {
    const el = elRef?.value
    if (!el) return

    e.preventDefault()
    e.stopPropagation()

    isResizing.value = true

    const startX = e.clientX
    const startWidth = width.value > 0 ? width.value : el.getBoundingClientRect().width

    if (width.value <= 0) width.value = startWidth

    maxW = maxW ?? getMaxWidth()

    const handle = e.currentTarget
    const pointerId = e.pointerId
    if (handle?.setPointerCapture) handle.setPointerCapture(pointerId)

    let rafId = 0
    let latestClientX = startX
    let lastApplied = width.value

    const applyWidth = () => {
      rafId = 0
      const dx = latestClientX - startX
      const rawNext = computeWidth
        ? computeWidth({ startWidth, dx, minWidth, maxWidth: maxW })
        : (startWidth + dx)

      const next = Math.min(maxW, Math.max(minWidth, rawNext))
      if (lastApplied === next) return
      lastApplied = next

      // Apply immediately for better perceived responsiveness.
      // (Vue style patching is async/batched, and can feel laggy on heavy DOM.)
      el.style.width = `${Math.round(next)}px`

      if (width.value !== next) width.value = next
    }

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return
      // Prefer the latest coalesced event for fast pointer movement.
      const coalesced = ev.getCoalescedEvents?.()
      latestClientX = (coalesced && coalesced.length)
        ? coalesced[coalesced.length - 1].clientX
        : ev.clientX
      if (!rafId) rafId = requestAnimationFrame(applyWidth)
    }

    const onUp = (ev) => {
      if (ev.pointerId !== pointerId) return

      ev.preventDefault()
      ev.stopPropagation()

      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }

      if (handle?.releasePointerCapture) {
        try {
          handle.releasePointerCapture(pointerId)
        } catch {}
      }

      handle?.removeEventListener?.('pointermove', onMove)

      ignoreDragUntil = performance.now() + cooldownMs
      isResizing.value = false
    }

    handle?.addEventListener?.('pointermove', onMove)
    handle?.addEventListener?.('pointerup', onUp, { once: true })
    handle?.addEventListener?.('pointercancel', onUp, { once: true })
  }

  return {
    isResizing,
    width,
    onResizePointerDown,
    canStartDrag,
  }
}
