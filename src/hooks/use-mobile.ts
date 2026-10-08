import * as React from "react"

const MOBILE_BREAKPOINT = 768

function readIsMobile(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT
}

export function useIsMobile() {
  // Seeded during render (lazily) so the first paint is already correct and
  // the effect only has to *listen* for changes.
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    typeof window === "undefined" ? undefined : readIsMobile,
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(readIsMobile())
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
