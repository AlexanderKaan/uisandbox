import type { IconSet } from '../tokens/types'

/**
 * Library recommendation + install info per icon style. Used by design.md,
 * AGENTS.md, tokens.json and the CSS export headers — so a user dropping
 * any of those files into a fresh project knows exactly which npm package
 * to install and how to import an icon.
 *
 * React-first because that's where Cursor/v0/Lovable/Bolt all default.
 * Phosphor regular and bold share one package (weight prop differentiates).
 */
export interface IconLibInfo {
  label: string
  pkg: string
  install: string
  importExample: string
  sw: number
  fill: boolean
}

export const ICON_LIBS: Record<IconSet, IconLibInfo> = {
  hairline: {
    label: 'Iconoir (1.5px stroke, rounded joins)',
    pkg: 'iconoir-react',
    install: 'npm install iconoir-react',
    importExample: "import { Bell } from 'iconoir-react'\n<Bell width={20} height={20} strokeWidth={1.5} />",
    sw: 1.5,
    fill: false,
  },
  line: {
    label: 'Lucide (1.75px stroke, balanced)',
    pkg: 'lucide-react',
    install: 'npm install lucide-react',
    importExample: "import { Bell } from 'lucide-react'\n<Bell size={20} strokeWidth={1.75} />",
    sw: 1.75,
    fill: false,
  },
  rounded: {
    label: 'Phosphor regular (rounded terminals)',
    pkg: '@phosphor-icons/react',
    install: 'npm install @phosphor-icons/react',
    importExample: "import { Bell } from '@phosphor-icons/react'\n<Bell size={20} weight=\"regular\" />",
    sw: 1.5,
    fill: false,
  },
  bold: {
    label: 'Phosphor bold (heavy weight)',
    pkg: '@phosphor-icons/react',
    install: 'npm install @phosphor-icons/react',
    importExample: "import { Bell } from '@phosphor-icons/react'\n<Bell size={20} weight=\"bold\" />",
    sw: 2.0,
    fill: false,
  },
  solid: {
    label: 'Heroicons solid (filled)',
    pkg: '@heroicons/react',
    install: 'npm install @heroicons/react',
    importExample: "import { BellIcon } from '@heroicons/react/24/solid'\n<BellIcon className=\"w-5 h-5\" />",
    sw: 0,
    fill: true,
  },
}
