// Bluebound Ink: design helpers for review pages.
// 1. Takes the main color of the book cover and gives the header that color.
// 2. Adds "More #genre books" at the end, read from books.html.

(function () {
    const cover = document.querySelector('.review-cover');
    if (!cover) return;

    // ---------- 1. Cover color ----------
    function useCoverColor() {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 24;
            canvas.height = 36;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(cover, 0, 0, canvas.width, canvas.height);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

            // Average the colorful pixels; skip near-white, near-black and grey ones
            let r = 0, g = 0, b = 0, n = 0;
            for (let i = 0; i < pixels.length; i += 4) {
                const pr = pixels[i], pg = pixels[i + 1], pb = pixels[i + 2];
                const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb);
                if (max < 40 || min > 220 || max - min < 30) continue;
                r += pr; g += pg; b += pb; n++;
            }
            if (!n) return;
            document.body.style.setProperty('--cover-color',
                `${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)}`);
        } catch (error) {
            // Keep the default gold color
        }
    }

    if (cover.complete) useCoverColor();
    else cover.addEventListener('load', useCoverColor);

    // ---------- 2. More like this ----------
    const tags = Array.from(document.querySelectorAll('.review-tags .genre-tag'))
        .map(tag => tag.textContent.replace('#', ''));
    if (!tags.length) return;

    // Use the most specific tag ("fantasy" is too broad when there is another one)
    const genre = tags.find(tag => tag !== 'fantasy') || tags[0];
    const thisPage = window.location.pathname.split('/').pop();

    fetch('/books.html')
        .then(response => response.text())
        .then(html => {
            const page = new DOMParser().parseFromString(html, 'text/html');
            const matches = Array.from(page.querySelectorAll('.book-item[data-genres]'))
                .filter(book => book.dataset.genres.split(' ').includes(genre))
                .filter(book => !book.querySelector('a').getAttribute('href').endsWith(thisPage))
                .slice(0, 4);
            if (!matches.length) return;

            const section = document.createElement('section');
            section.className = 'more-like-this';
            section.innerHTML = `<h3>More #${genre} books</h3><div class="book-list"></div>`;
            const list = section.querySelector('.book-list');

            matches.forEach(book => {
                const item = document.importNode(book, true);
                // Links in books.html start from the site root
                item.querySelectorAll('a').forEach(a => a.setAttribute('href', '/' + a.getAttribute('href')));
                item.querySelectorAll('img').forEach(img => img.setAttribute('src', '/' + img.getAttribute('src')));
                list.appendChild(item);
            });

            const main = document.querySelector('main');
            main.insertBefore(section, main.querySelector('.back-link'));
        })
        .catch(() => {});
})();
