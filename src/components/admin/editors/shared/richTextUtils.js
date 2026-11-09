// Helpers shared by the exercise editors' rich-text fields.

// Preview-only conversion: markdown-style images/links and raw <img>/<audio> tags -> styled HTML.
export const markdownToHtml = (text) => {
  if (!text) return ''
  let html = text
  // Images ![alt](url) - markdown format
  html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (m, alt, url) => `<img src="${url}" alt="${alt || ''}" class="max-w-full h-auto rounded-lg my-2" />`)
  // HTML img tags - preserve existing attributes
  html = html.replace(/<img([^>]*?)>/g, (m, attrs) => `<img${attrs} class="max-w-full h-auto rounded-lg my-2" />`)
  // HTML audio tags - preserve existing attributes
  html = html.replace(/<audio([^>]*?)>/g, (m, attrs) => `<audio${attrs} class="w-full my-2"></audio>`)
  // Links [text](url)
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, (m, text1, url) => `<a href="${url}" target="_blank" rel="noreferrer">${text1 || url}</a>`)
  return html
}
