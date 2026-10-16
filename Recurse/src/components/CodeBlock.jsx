import { useMemo, useState } from 'react'
import { Check, Copy, WrapText } from 'lucide-react'
import hljs from 'highlight.js/lib/core'
import python from 'highlight.js/lib/languages/python'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import sql from 'highlight.js/lib/languages/sql'
import bash from 'highlight.js/lib/languages/bash'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import yaml from 'highlight.js/lib/languages/yaml'
import java from 'highlight.js/lib/languages/java'
import cpp from 'highlight.js/lib/languages/cpp'
import go from 'highlight.js/lib/languages/go'
import cisco from '../activities/lib/ios/hljs-cisco.js'
import { BLANK } from '../lib/packSchema'

hljs.registerLanguage('python', python)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('java', java)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('go', go)
hljs.registerLanguage('cisco', cisco)

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function highlight(code, language) {
  let html
  try {
    html = hljs.getLanguage(language) ? hljs.highlight(code, { language, ignoreIllegals: true }).value : escape(code)
  } catch {
    html = escape(code)
  }
  // Mark fill-in-the-blank gaps. hljs output is escaped, so the literal blank survives.
  return html.split(BLANK).join(`<mark class="blank" aria-label="blank">${BLANK}</mark>`)
}

export default function CodeBlock({ code, language = 'plaintext', label }) {
  const [copied, setCopied] = useState(false)
  const [wrap, setWrap] = useState(false)
  const html = useMemo(() => highlight(code, language), [code, language])
  // Long lines scroll sideways on a phone; offer to wrap them instead.
  const wide = useMemo(() => code.split('\n').some((line) => line.length > 44), [code])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="code">
      <div className="code-head">
        <span className="grow">{label || (language === 'plaintext' ? 'text' : language)}</span>
        {wide && (
          <button type="button" className="btn btn-ghost btn-sm code-wrap-toggle" onClick={() => setWrap((w) => !w)} aria-pressed={wrap}>
            <WrapText size={14} /> Wrap
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={copy} aria-label="Copy code">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className={wrap ? 'wrapped' : undefined}>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  )
}
