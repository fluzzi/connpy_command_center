import React from 'react';
import { renderToString } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';

const markdownComponents = {
    a: ({ href, children, ...props }) => {
      console.log("a component received children:", JSON.stringify(children, null, 2));
      return React.createElement('a', { href: href || '#' }, children);
    },
    code: ({ className, children, ...props }) => {
      console.log("code component received children:", JSON.stringify(children, null, 2));
      return React.createElement('code', {}, children);
    }
};

const text = "This is a [link](connpy://node/abc) and some `inline code`";

console.log(renderToString(React.createElement(ReactMarkdown, { components: markdownComponents }, text)));
