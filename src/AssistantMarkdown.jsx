import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const allowedElements = ['p', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'br', 'hr', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td']
const components = {
  a: ({ children, href, title }) => href
    ? <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>
    : <span>{children}</span>,
  table: ({ children }) => <div className="assistant-table"><table>{children}</table></div>,
}

export default function AssistantMarkdown({ children }) {
  return <div className="assistant-markdown"><Markdown remarkPlugins={[remarkGfm]} allowedElements={allowedElements} skipHtml components={components}>{children}</Markdown></div>
}
