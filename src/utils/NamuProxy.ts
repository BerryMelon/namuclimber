export interface NamuPage {
  title: string;
  content: string;
}

export const fetchNamuPage = async (titleOrUrl: string): Promise<NamuPage> => {
  const isUrl = titleOrUrl.startsWith('http');
  const url = isUrl ? titleOrUrl : `https://namu.wiki/w/${encodeURIComponent(titleOrUrl)}`;
  
  // Use AllOrigins proxy to bypass CORS
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  
  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error('Failed to fetch from proxy');
    
    const data = await response.json();
    const html = data.contents;
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Namuwiki's title is often in the <title> or <h1>
    const title = doc.querySelector('h1')?.textContent || titleOrUrl;
    
    // Namuwiki's content is usually in an article tag or a specific div
    // We try to find the most relevant content block
    const article = doc.querySelector('article') || doc.querySelector('.wiki-heading-content')?.parentElement;
    
    if (!article) throw new Error('Could not find article content');

    // Clean up unwanted elements
    const elementsToRemove = article.querySelectorAll('script, style, iframe, .wiki-ads, .wiki-edit-section');
    elementsToRemove.forEach(el => el.remove());

    // Rewrite links
    const links = article.querySelectorAll('a');
    links.forEach(link => {
      const href = link.getAttribute('href');
      if (href && (href.startsWith('/w/') || href.startsWith('https://namu.wiki/w/'))) {
        const pageName = href.split('/w/')[1];
        if (pageName) {
          link.setAttribute('href', '#');
          link.setAttribute('data-page', decodeURIComponent(pageName));
          link.style.color = '#3b82f6'; // tailwind blue-500
          link.style.textDecoration = 'underline';
          link.style.cursor = 'pointer';
        }
      } else if (href && !href.startsWith('#')) {
        // Disable external links or links that are not wiki pages for the game
        link.onclick = (e) => e.preventDefault();
        link.style.opacity = '0.5';
        link.style.cursor = 'not-allowed';
      }
    });

    return {
      title,
      content: article.innerHTML
    };
  } catch (error) {
    console.error('Error fetching Namuwiki page:', error);
    throw error;
  }
};

export const getRandomNamuPage = async (): Promise<NamuPage> => {
  return fetchNamuPage('https://namu.wiki/random');
};
