import type { MacroDefinition } from '../types';

export const MACROS: MacroDefinition[] = [
  {
    id: 'open-research-set',
    title: 'Open Research Set',
    description: 'Save highlighted tabs as a research pane with AI brief preset.',
    icon: '\uD83D\uDD0D',
    category: 'research',
    requiresSources: false,
  },
  {
    id: 'build-focus-workspace',
    title: 'Build Focus Workspace',
    description: 'Create a focused pane from highlighted tabs.',
    icon: '\uD83C\uDFAF',
    category: 'focus',
    requiresSources: false,
  },
  {
    id: 'archive-finished-tabs',
    title: 'Archive Finished Tabs',
    description: 'Save selected tabs to archive and close them.',
    icon: '\uD83D\uDCE6',
    category: 'cleanup',
    requiresSources: false,
  },
  {
    id: 'restore-session',
    title: 'Restore Session',
    description: 'Reopen a saved pane or session.',
    icon: '\uD83D\uDD04',
    category: 'session',
    requiresSources: false,
  },
  {
    id: 'summarize-pane',
    title: 'Summarize Selected Pane',
    description: 'Add pane tabs to sources and run synthesis.',
    icon: '\uD83D\uDCCA',
    category: 'synthesis',
    requiresSources: true,
  },
  {
    id: 'compare-tabs',
    title: 'Compare Selected Tabs',
    description: 'Compare sources for repeated and unique ideas.',
    icon: '\u2696\uFE0F',
    category: 'synthesis',
    requiresSources: true,
  },
  {
    id: 'extract-pricing',
    title: 'Extract Pricing / Features',
    description: 'Extract pricing, features, and make a comparison table.',
    icon: '\uD83D\uDCCB',
    category: 'synthesis',
    requiresSources: true,
  },
];

export function getMacroById(id: string): MacroDefinition | undefined {
  return MACROS.find(m => m.id === id);
}
