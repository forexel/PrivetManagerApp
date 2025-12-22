// чтобы TS понимал обычные SVG как строку
declare module '*.svg' {
  const src: string
  export default src
}

// чтобы TS понимал SVGR-компоненты `*.svg?react`
declare module '*.svg?react' {
  import * as React from 'react'
  const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>
  export default ReactComponent
}