import React from 'react';
import katex from 'katex';

export const MathText: React.FC<{ expression: string; block?: boolean }> = ({ expression, block = false }) => {
  try {
    const html = katex.renderToString(expression, {
      throwOnError: false,
      displayMode: block,
    });
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return <code className="text-amber-300">{expression}</code>;
  }
};
