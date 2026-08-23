// src/engine/registry.js
/**
 * Dynamic Tool Plugin Registry & Metadata Resolver
 * Strictly Decoupled: Holds zero DOM references.
 */
class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  register(toolModule) {
    if (!toolModule || !toolModule.id || !toolModule.title) {
      console.error('[Registry] Invalid Tool Plugin Interface:', toolModule);
      return;
    }

    const normalizedTool = {
      id: toolModule.id,
      title: toolModule.title,
      category: toolModule.category || 'General',
      icon: toolModule.icon || '⚡',
      accept: Array.isArray(toolModule.accept) ? toolModule.accept : ['*/*'],
      keywords: Array.isArray(toolModule.keywords) ? toolModule.keywords : [],
      description: toolModule.description || '',
      options: Array.isArray(toolModule.options) ? toolModule.options : [],
      maxFiles: toolModule.maxFiles !== undefined ? Number(toolModule.maxFiles) : 20,
      hasPageGrid: Boolean(toolModule.hasPageGrid),
      batchExecute: Boolean(toolModule.batchExecute),
      execute: typeof toolModule.execute === 'function' ? toolModule.execute : null,
      executeBatch: typeof toolModule.executeBatch === 'function' ? toolModule.executeBatch : null
    };

    this.tools.set(normalizedTool.id, normalizedTool);
    console.log(`[Registry] Registered decoupled plugin: [${normalizedTool.id}] under (${normalizedTool.category})`);
  }

  getTool(id) {
    return this.tools.get(id) || null;
  }

  getAllTools() {
    return Array.from(this.tools.values());
  }

  getCategories() {
    const categories = new Set(['All']);
    for (const tool of this.tools.values()) {
      if (tool.category) {
        categories.add(tool.category);
      }
    }
    return Array.from(categories);
  }

  getToolsByCategory(category = 'All') {
    const all = this.getAllTools();
    if (!category || category === 'All') return all;
    return all.filter(t => t.category.toLowerCase() === category.toLowerCase());
  }

  matchToolForMimeType(mimeType) {
    if (!mimeType) return null;
    for (const tool of this.tools.values()) {
      const match = tool.accept.some(pattern => {
        if (pattern === '*/*' || pattern === mimeType) return true;
        if (pattern.endsWith('/*')) {
          const prefix = pattern.slice(0, -2);
          return mimeType.startsWith(prefix);
        }
        return false;
      });
      if (match) return tool;
    }
    return null;
  }

  matchToolByKeyword(query) {
    if (!query) return this.getAllTools();
    const q = query.toLowerCase().trim();
    return this.getAllTools().filter(tool => {
      return (
        tool.id.toLowerCase().includes(q) ||
        tool.title.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        tool.category.toLowerCase().includes(q) ||
        tool.keywords.some(k => k.toLowerCase().includes(q))
      );
    });
  }
}

export const registry = new ToolRegistry();
