declare module '*.mdx' {
  import type { ReactNode } from 'react'
  const component: (props: any) => ReactNode
  export default component
}
