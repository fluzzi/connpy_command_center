import React from 'react';
import { renderToString } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';

const markdownComponents = {
    a: ({ href, children }: any) => {
      return <a href={href || '#'}>{children}</a>;
    },
    code: ({ className, children, ...props }: any) => {
      const content = String(children).replace(/\n$/, '');
      return <code>{content}</code>;
    }
};

const text = "This is a [link](connpy://node/abc) and some `inline code` and a `code block \n with [link](connpy://...)`";

console.log(renderToString(<ReactMarkdown components={markdownComponents}>{text}</ReactMarkdown>));
