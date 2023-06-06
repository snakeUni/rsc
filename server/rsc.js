import { createServer } from 'http'
import { readFile, readdir } from 'fs/promises'
import sanitizeFilename from 'sanitize-filename'
import ReactMarkdown from 'react-markdown'
import path from 'path'

const postsPath = path.join(process.cwd(), 'posts')

// This is a server to host data-local resources like databases and RSC.

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  try {
    await sendJSX(res, <Router url={url} />)
  } catch (err) {
    console.error(err)
    res.writeHead(err.statusCode ?? 500)
    res.end()
  }
}).listen(8081)

function Router({ url }) {
  let page
  if (url.pathname === '/') {
    page = <BlogIndexPage />
  } else if (!url.pathname.includes('.')) {
    const postSlug = sanitizeFilename(url.pathname.slice(1))
    page = <BlogPostPage postSlug={postSlug} />
  } else if (url.pathname === '/favicon.ico') {
    return 'favicon'
  } else {
    const notFound = new Error('Not found.')
    notFound.statusCode = 404
    throw notFound
  }
  return <BlogLayout>{page}</BlogLayout>
}

async function BlogIndexPage() {
  const postFiles = await readdir(postsPath)
  const postSlugs = postFiles.map(file => file.slice(0, file.lastIndexOf('.')))
  return (
    <section>
      <h1>Welcome to my blog</h1>
      <div>
        {postSlugs.map(slug => (
          <Post key={slug} slug={slug} />
        ))}
      </div>
      <ReactMarkdown># Hello, *world*!</ReactMarkdown>
    </section>
  )
}

function BlogPostPage({ postSlug }) {
  return <Post slug={postSlug} />
}

async function Post({ slug }) {
  const content = await readFile(`${postsPath}/` + slug + '.txt', 'utf8')
  return (
    <section>
      <h2>
        <a href={'/' + slug}>{slug}</a>
      </h2>
      <article>{content}</article>
    </section>
  )
}

function BlogLayout({ children }) {
  const author = 'Jae Doe'
  return (
    <html>
      <head>
        <title>My blog</title>
      </head>
      <body>
        <nav>
          <a href="/">Home</a>
          <hr />
          <input />
          <hr />
        </nav>
        <main>{children}</main>
        <Footer author={author} />
      </body>
    </html>
  )
}

function Footer({ author }) {
  return (
    <footer>
      <hr />
      <p>
        <i>
          (c) {author} {new Date().getFullYear()}
        </i>
      </p>
    </footer>
  )
}

async function sendJSX(res, jsx) {
  console.log('jsx:', jsx)
  const clientJSX = await renderJSXToClientJSX(jsx)
  const clientJSXString = JSON.stringify(clientJSX, stringifyJSX)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(clientJSXString)
}

function stringifyJSX(key, value) {
  if (value === Symbol.for('react.element')) {
    return '$RE'
  } else if (typeof value === 'string' && value.startsWith('$')) {
    return '$' + value
  } else {
    return value
  }
}

/**
 * 这里需要递归执行，因为在服务端不会运行，需要转换成客户端需要
 * 的 jsx 的形式，否则默认就一个 Router
 * @param {*} jsx
 * @returns
 */
async function renderJSXToClientJSX(jsx) {
  if (
    typeof jsx === 'string' ||
    typeof jsx === 'number' ||
    typeof jsx === 'boolean' ||
    jsx == null
  ) {
    return jsx
  } else if (Array.isArray(jsx)) {
    return Promise.all(jsx.map(child => renderJSXToClientJSX(child)))
  } else if (jsx != null && typeof jsx === 'object') {
    if (jsx.$$typeof === Symbol.for('react.element')) {
      if (typeof jsx.type === 'string') {
        return {
          ...jsx,
          props: await renderJSXToClientJSX(jsx.props)
        }
      } else if (typeof jsx.type === 'function') {
        const Component = jsx.type
        const props = jsx.props
        const returnedJsx = await Component(props)
        return renderJSXToClientJSX(returnedJsx)
      } else if (jsx.type === Symbol.for('react.fragment')) {
        return renderJSXToClientJSX(jsx.props.children)
      } else throw new Error('Not implemented.')
    } else {
      return Object.fromEntries(
        await Promise.all(
          Object.entries(jsx).map(async ([propName, value]) => [
            propName,
            await renderJSXToClientJSX(value)
          ])
        )
      )
    }
  } else throw new Error('Not implemented')
}
