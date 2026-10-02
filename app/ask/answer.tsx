"use client";

// The answer comes back as Markdown — headings, tables, bold — because that is
// how a written answer is shaped. Rendering it as plain text put the pipes and
// hashes in front of the reader instead of the figures.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Answer({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-7 text-slate-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h2 className="text-base font-semibold mt-5 mb-2 first:mt-0" {...p} />,
          h2: (p) => <h2 className="text-base font-semibold mt-5 mb-2 first:mt-0" {...p} />,
          h3: (p) => <h3 className="text-sm font-semibold mt-4 mb-1.5" {...p} />,
          p: (p) => <p className="my-2.5" {...p} />,
          ul: (p) => <ul className="my-2.5 pl-5 list-disc space-y-1" {...p} />,
          ol: (p) => <ol className="my-2.5 pl-5 list-decimal space-y-1" {...p} />,
          li: (p) => <li className="pl-1" {...p} />,
          strong: (p) => <strong className="font-semibold text-slate-900" {...p} />,
          a: (p) => <a className="text-blue-600 underline" target="_blank" rel="noreferrer" {...p} />,
          code: (p) => (
            <code className="px-1 py-0.5 rounded bg-slate-100 text-[13px] font-mono" {...p} />
          ),
          hr: () => <hr className="my-4 border-slate-100" />,
          blockquote: (p) => (
            <blockquote className="border-l-2 border-slate-200 pl-3 text-slate-600 my-3" {...p} />
          ),
          // A table of figures is the point of most answers, so it gets room
          // to breathe and can scroll on a phone rather than squeezing.
          table: (p) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm border-collapse" {...p} />
            </div>
          ),
          thead: (p) => <thead className="bg-slate-50 text-slate-500" {...p} />,
          th: (p) => <th className="text-left font-medium px-3 py-2 border-b border-slate-200" {...p} />,
          td: (p) => <td className="px-3 py-2 border-b border-slate-100 align-top" {...p} />,
          tr: (p) => <tr className="last:border-0" {...p} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
