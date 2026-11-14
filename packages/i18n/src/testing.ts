type MessageTree = { readonly [key: string]: string | MessageTree };

export interface MessageKeyDiff {
  missing: string[];
  extra: string[];
}

function flattenKeys(tree: MessageTree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    return typeof value === 'string' ? [path] : flattenKeys(value, path);
  });
}

export function diffMessageKeys(reference: MessageTree, candidate: MessageTree): MessageKeyDiff {
  const referenceKeys = new Set(flattenKeys(reference));
  const candidateKeys = new Set(flattenKeys(candidate));

  return {
    missing: [...referenceKeys].filter((key) => !candidateKeys.has(key)),
    extra: [...candidateKeys].filter((key) => !referenceKeys.has(key)),
  };
}
