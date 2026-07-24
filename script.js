async function fetchNowPlaying() {
    try {
        const response = await fetch('/api/now-playing');
        const data = await response.json();

        const trackNameEl = document.querySelector('.track-name');
        const artistNameEl = document.querySelector('.artist-name');
        const vinylDisc = document.querySelector('.vinyl-disc');
        const albumArtCenter = document.querySelector('.album-art-center');

        if (!data.isPlaying) {
            trackNameEl.textContent = "Offline";
            artistNameEl.textContent = "Spotify paused";
            vinylDisc.style.animationPlayState = 'paused';
            if (albumArtCenter) {
                albumArtCenter.innerHTML = '♫'; // Default icon when offline
            }
            return;
        }

        // Update with active song data
        trackNameEl.textContent = data.title;
        artistNameEl.textContent = data.artist;
        vinylDisc.style.animationPlayState = 'running';

        // Update album art center image if available
        if (albumArtCenter && data.albumImageUrl) {
            albumArtCenter.innerHTML = `<img src="${data.albumImageUrl}" alt="Album Art" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        }

    } catch (error) {
        console.error('Failed to fetch now playing:', error);
        document.querySelector('.track-name').textContent = "Offline";
        document.querySelector('.artist-name').textContent = "Connection error";
    }
}

// Poll every 5 seconds
setInterval(fetchNowPlaying, 5000);
fetchNowPlaying();