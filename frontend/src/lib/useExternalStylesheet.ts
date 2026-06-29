import { useEffect } from 'react'

const DEFAULT_STYLESHEETS = [
  '/assets/css/bootstrap.min.css',
  '/assets/css/font-awesome.min.css',
  '/assets/css/line-awesome.min.css',
  '/assets/css/style.css',
  '/assets/css/responsive.css',
]

const refCounts: Record<string, number> = {}
const linkElements: Record<string, HTMLLinkElement> = {}

export function useExternalStylesheet(stylesheets = DEFAULT_STYLESHEETS) {
  const depsKey = stylesheets.join(',')

  useEffect(() => {
    stylesheets.forEach((url) => {
      refCounts[url] = (refCounts[url] || 0) + 1
      if (refCounts[url] === 1) {
        let link = document.querySelector(`link[href="${url}"]`) as HTMLLinkElement
        if (!link) {
          link = document.createElement('link')
          link.rel = 'stylesheet'
          link.type = 'text/css'
          link.href = url
          document.head.appendChild(link)
        }
        linkElements[url] = link
      }
    })

    return () => {
      stylesheets.forEach((url) => {
        if (refCounts[url]) {
          refCounts[url]--
          if (refCounts[url] === 0) {
            const link = linkElements[url]
            if (link && document.head.contains(link)) {
              document.head.removeChild(link)
            }
            delete refCounts[url]
            delete linkElements[url]
          }
        }
      })
    }
  }, [depsKey])
}

